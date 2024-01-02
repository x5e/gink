import {
    builderToMuid,
    ensure,
    generateTimestamp, dehydrate,
    matches,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    sameData,
    unwrapValue
} from "./utils";
import { deleteDB, IDBPDatabase, openDB, IDBPTransaction } from 'idb';
import {
    AsOf,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChains,
    Clearance,
    Entry, Indexable,
    IndexedDbStoreSchema,
    KeyType,
    Medallion,
    Muid,
    MuidTuple,
    Offset,
    Removal,
    SeenThrough,
    Timestamp,
} from "./typedefs";
import { extractCommitInfo, extractContainerMuid, getEffectiveKey, extractMovementInfo, buildPairLists, buildPointeeList, muidPairToSemanticKey, buildChainTracker, keyToSemanticKey, commitKeyToInfo, commitInfoToKey } from "./store_utils";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, BundleBuilder, ChangeBuilder, EntryBuilder } from "./builders";
import { Container } from './Container';
import { PromiseChainLock } from "./PromiseChainLock";

type Transaction = IDBPTransaction<IndexedDbStoreSchema, ("trxns" | "chainInfos" | "activeChains" | "containers" | "removals" | "clearances" | "entries")[], "readwrite">;

if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
}

/**
 * Uses an indexedDb to implement the Store interface.  On the server side, this will
 * be done using a shim that is only an in-memory implementation of the IndexedDb API,
 * so the LogBackedStore should be used on the server for persistence.  Most of the time
 * uses of Gink should not need to call methods on the store directly, instead just
 * pass it into the GinkInstance (or SimpleServer, etc.).
 */
export class IndexedDbStore implements Store {

    ready: Promise<void>;
    private wrapped: IDBPDatabase<IndexedDbStoreSchema>;
    private transaction: Transaction|null = null;
    private countTrxns: number = 0;
    private initialized = false;
    private processingLock = new PromiseChainLock();
    private static readonly YEAR_2020 = (new Date("2020-01-01")).getTime() * 1000;

    constructor(indexedDbName = "gink-default", reset = false, private keepingHistory = true) {
        this.ready = this.initialize(indexedDbName, reset);
    }

    private async initialize(indexedDbName: string, reset: boolean): Promise<void> {
        if (reset) {
            await deleteDB(indexedDbName, {
                blocked() {
                    const msg = `Unable to delete IndexedDB database ${indexedDbName} !!!`;
                    throw new Error(msg);
                }
            });
        }
        this.wrapped = await openDB<IndexedDbStoreSchema>(indexedDbName, 1, {
            upgrade(db: IDBPDatabase<IndexedDbStoreSchema>, _oldVersion: number, _newVersion: number, _transaction) {
                // info(`upgrade, oldVersion:${oldVersion}, newVersion:${newVersion}`);
                /*
                     The object store for transactions will store the raw bytes received
                     for each transaction to avoid dropping unknown fields.  Since this
                     isn't a javascript object, we'll use
                     [timestamp, medallion] to keep transactions ordered in time.
                 */
                db.createObjectStore('trxns'); // a map from CommitKey to CommitBytes

                /*
                    Stores ChainInfo objects.
                    This will keep track of which transactions have been processed per chain.
                */
                db.createObjectStore('chainInfos', { keyPath: ["medallion", "chainStart"] });

                /*
                    Keep track of active chains this instance can write to.
                    It stores objects with two keys: "medallion" and "chainStart",
                    which have value Medallion and ChainStart respectively.
                    This could alternatively be implemented with a keys being
                    medallions and values being chainStarts, but this is a little
                    easier because the getAll() interface is a bit nicer than
                    working with the cursor interface.
                */
                db.createObjectStore('activeChains', { keyPath: "medallion" });

                db.createObjectStore("clearances", { keyPath: ["containerId", "clearanceId"] });

                db.createObjectStore('containers'); // map from AddressTuple to ContainerBytes

                // the "removals" stores objects of type `Removal`
                const removals = db.createObjectStore('removals', { keyPath: "removalId" });
                removals.createIndex("by-container-movement", ["containerId", "removalId"]);
                removals.createIndex("by-removing", ["removing", "removalId"]);

                // The "entries" store has objects of type Entry (from typedefs)
                const entries = db.createObjectStore('entries', { keyPath: "placementId" });
                entries.createIndex("by-container-key-placement", ["containerId", "effectiveKey", "placementId"]);
                entries.createIndex("pointees", "pointeeList", { multiEntry: true, unique: false });
                entries.createIndex("locations", ["entryId", "placementId"]);
                entries.createIndex("sources", "sourceList", { multiEntry: true, unique: false });
                entries.createIndex("targets", "targetList", { multiEntry: true, unique: false });
            },
        });
        this.initialized = true;
    }

    private getTransaction() {
        if (this.transaction === null) {
            this.transaction = this.wrapped.transaction(
                ['entries', 'clearances', 'removals', 'trxns', 'chainInfos', 'activeChains', 'containers'],
                'readwrite');
            const thisIndexedDbStore = this;
            this.transaction.done.finally(() => {
                thisIndexedDbStore.transaction = null;
                thisIndexedDbStore.countTrxns += 1;
                // console.log(`finished transaction number ${thisIndexedDbStore.countTrxns}`);
            });
        }
        return this.transaction;
    }

    getTransactionCount(): number {
        return this.countTrxns;
    }

    async dropHistory(container?: Muid, before?: AsOf): Promise<void> {
        const beforeTs = before ? await this.asOfToTimestamp(before) : generateTimestamp();
        const trxn = this.getTransaction();
        let removalsCursor = await trxn.objectStore("removals").openCursor(IDBKeyRange.upperBound([beforeTs]));
        if (container) {
            const containerTuple = muidToTuple(container);
            const range = IDBKeyRange.bound([containerTuple, [0]], [containerTuple, [beforeTs]]);
            removalsCursor = await trxn.objectStore("removals").index("by-container-movement").openCursor(range);
        }
        while (removalsCursor) {
            await trxn.objectStore("entries").delete(removalsCursor.value.removing);
            await removalsCursor.delete();
            removalsCursor = await removalsCursor.continue();
        }
        return trxn.done;
    }

    async stopHistory(): Promise<void> {
        this.keepingHistory = false;
        return this.dropHistory();
    }

    startHistory(): void {
        this.keepingHistory = true;
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        await this.ready;
        const indexable = dehydrate(pointingTo);
        return this.wrapped.getAllFromIndex("entries", "pointees", indexable);
    }

    async close() {
        try {
            await this.ready;
        } finally {
            if (this.wrapped) {
                this.wrapped.close();
            }
        }
    }

    private async asOfToTimestamp(asOf: AsOf): Promise<Timestamp> {
        if (asOf instanceof Date) {
            return asOf.getTime() * 1000;
        }
        if (asOf > IndexedDbStore.YEAR_2020) {
            return asOf;
        }
        if (asOf < 0 && asOf > -1000) {
            // Interpret as number of commits in the past.
            let cursor = await this.getTransaction().objectStore("trxns").openCursor(undefined, "prev");
            let commitsToTraverse = -asOf;
            for (; cursor; cursor = await cursor.continue()) {
                if (--commitsToTraverse == 0) {
                    const tuple = <BundleInfoTuple>cursor.key;
                    return tuple[0];
                }
            }
            // Looking further back then we have commits.
            throw new Error("no commits that far back");
        }
        throw new Error(`don't know how to interpret asOf=${asOf}`);
    }

    async getClaimedChains(): Promise<ClaimedChains> {
        if (! this.initialized) throw new Error("not initilized");
        const objectStore = this.getTransaction().objectStore("activeChains");
        const items = await objectStore.getAll();
        const result = new Map();
        for (let i = 0; i < items.length; i++) {
            result.set(items[i].medallion, items[i].chainStart);
        }
        return result;
    }

    async claimChain(medallion: Medallion, chainStart: ChainStart): Promise<void> {
        //TODO(https://github.com/google/gink/issues/29): check for medallion reuse
        await this.ready;
        const wrappedTransaction = this.getTransaction();
        await wrappedTransaction.objectStore('activeChains').add({ chainStart, medallion });
        return wrappedTransaction.done;
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        const chainInfos = await this.getChainInfos();
        const chainTracker = buildChainTracker(chainInfos);
        return chainTracker;
    }

    private async getChainInfos(): Promise<Array<BundleInfo>> {
        await this.ready;
        return await this.getTransaction().objectStore('chainInfos').getAll();
    }

    addBundle(bundleBytes: BundleBytes): Promise<BundleInfo> {
        if (!this.initialized) throw new Error("not initialized! need to await on .ready");
        const bundleBuilder = <BundleBuilder>BundleBuilder.deserializeBinary(bundleBytes);
        const bundleInfo = extractCommitInfo(bundleBuilder);
        //console.log(`got ${JSON.stringify(bundleInfo)}`);

        return this.processingLock.acquireLock().then((unlock) => {
            return this.addBundleHelper(bundleBytes, bundleInfo, bundleBuilder).then((trxn) => {
                unlock(); return trxn.done.then(() => bundleInfo); }).finally(unlock);
        });
    }

    private async addBundleHelper(bundleBytes: BundleBytes, bundleInfo: BundleInfo, bundleBuilder: BundleBuilder):
    Promise<Transaction> {
        console.log(`starting addBundleHelper for: ` + JSON.stringify(bundleInfo));
        const { timestamp, medallion, chainStart, priorTime } = bundleInfo;
        const wrappedTransaction = this.getTransaction();
        const oldChainInfo: BundleInfo = await wrappedTransaction.objectStore("chainInfos").get([medallion, chainStart]);
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return;
            }
            if (oldChainInfo?.timestamp != priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close?
                throw new Error(`missing, have ${JSON.stringify(bundleInfo)}, have ${JSON.stringify(oldChainInfo)}`);
            }
        }
        await wrappedTransaction.objectStore("chainInfos").put(bundleInfo);
        // Only timestamp and medallion are required for uniqueness, the others just added to make
        // the getNeededTransactions faster by not requiring parsing again.
        const commitKey: BundleInfoTuple = commitInfoToKey(bundleInfo);
        await wrappedTransaction.objectStore("trxns").add(bundleBytes, commitKey);
        const changesMap: Map<Offset, ChangeBuilder> = bundleBuilder.getChangesMap();
        for (const [offset, changeBuilder] of changesMap.entries()) {
            ensure(offset > 0);
            const changeAddressTuple: MuidTuple = [timestamp, medallion, offset];
            if (changeBuilder.hasContainer()) {
                const containerBytes = changeBuilder.getContainer().serializeBinary();
                await wrappedTransaction.objectStore("containers").add(containerBytes, changeAddressTuple);
                continue;
            }
            if (changeBuilder.hasEntry()) {
                const entryBuilder: EntryBuilder = changeBuilder.getEntry();
                // TODO(https://github.com/google/gink/issues/55): explain root
                let containerId: MuidTuple = [0, 0, 0];
                if (entryBuilder.hasContainer()) {
                    containerId = extractContainerMuid(entryBuilder, bundleInfo);
                }
                const [effectiveKey, replacing] = getEffectiveKey(entryBuilder, timestamp);
                const entryId: MuidTuple = [timestamp, medallion, offset];
                const behavior: Behavior = entryBuilder.getBehavior();
                const placementId: MuidTuple = entryId;
                let pointeeList = <Indexable[]>[];
                if (entryBuilder.hasPointee()) {
                    pointeeList = buildPointeeList(entryBuilder, bundleInfo);
                }
                let sourceList = <Indexable[]>[];
                let targetList = <Indexable[]>[];
                if (entryBuilder.hasPair()) {
                    [sourceList, targetList] = buildPairLists(entryBuilder, bundleInfo);
                }
                const value = entryBuilder.hasValue() ? unwrapValue(entryBuilder.getValue()) : undefined;
                const expiry = entryBuilder.getExpiry() || undefined;
                const deletion = entryBuilder.getDeletion();
                const entry: Entry = {
                    behavior,
                    containerId,
                    effectiveKey,
                    entryId,
                    pointeeList,
                    value,
                    expiry,
                    deletion,
                    placementId,
                    sourceList,
                    targetList,
                };
                if (replacing) {
                    const range = IDBKeyRange.bound([containerId, effectiveKey], [containerId, effectiveKey, placementId]);
                    const search = await wrappedTransaction.objectStore("entries").index("by-container-key-placement"
                    ).openCursor(range, "prev");
                    if (search) {
                        if (this.keepingHistory) {
                            const removal: Removal = {
                                removing: search.value.placementId,
                                removalId: placementId,
                                containerId: containerId,
                                dest: 0,
                                entryId: search.value.entryId
                            }
                            await wrappedTransaction.objectStore("removals").add(removal);
                        } else {
                            await wrappedTransaction.objectStore("entries").delete(placementId);
                        }
                    }
                }
                await wrappedTransaction.objectStore("entries").add(entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                const { movementBuilder, entryId, movementId, containerId } = extractMovementInfo(changeBuilder, bundleInfo, offset);
                const range = IDBKeyRange.bound([entryId, [0]], [entryId, [Infinity]]);
                const search = await wrappedTransaction.objectStore("entries").index("locations").openCursor(range, "prev");
                if (!search) {
                    continue; // Nothing found to remove.
                }
                const found: Entry = search.value;
                const dest = movementBuilder.getDest();
                if (dest != 0) {
                    const destEntry: Entry = {
                        behavior: found.behavior,
                        containerId: found.containerId,
                        effectiveKey: dest,
                        entryId: found.entryId,
                        pointeeList: found.pointeeList,
                        value: found.value,
                        expiry: found.expiry,
                        deletion: found.deletion,
                        placementId: movementId,
                        sourceList: found.sourceList,
                        targetList: found.targetList,
                    }
                    await wrappedTransaction.objectStore("entries").add(destEntry);
                }
                if (movementBuilder.getPurge() || !this.keepingHistory) {
                    search.delete();
                } else {
                    const removal: Removal = {
                        containerId,
                        removalId: movementId,
                        dest,
                        entryId,
                        removing: found.placementId,
                    };
                    await wrappedTransaction.objectStore("removals").add(removal);
                }
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(clearanceBuilder.getContainer(), { timestamp, medallion, offset });
                const containerMuidTuple: MuidTuple = [container.timestamp, container.medallion, container.offset];
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    const onePast = [container.timestamp, container.medallion, container.offset + 1];
                    const range = IDBKeyRange.bound([containerMuidTuple], [onePast], false, true);
                    let entriesCursor = await wrappedTransaction.objectStore("entries").index("by-container-key-placement").openCursor(range);
                    while (entriesCursor) {
                        await entriesCursor.delete();
                        entriesCursor = await entriesCursor.continue();
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    let clearancesCursor = await wrappedTransaction.objectStore("clearances").openCursor(range);
                    while (clearancesCursor) {
                        await clearancesCursor.delete();
                        clearancesCursor = await clearancesCursor.continue();
                    }
                    // When doing a purging clear, remove all removals for the container.
                    let removalsCursor = await wrappedTransaction.objectStore("removals").index("by-container-movement").openCursor(range);
                    while (removalsCursor) {
                        await removalsCursor.delete();
                        removalsCursor = await removalsCursor.continue();
                    }
                }
                const clearance: Clearance = {
                    containerId: containerMuidTuple,
                    clearanceId: changeAddressTuple,
                    purging: clearanceBuilder.getPurge()
                };
                await wrappedTransaction.objectStore("clearances").add(clearance);
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        console.log(`finished addBundleHelper for: ` + JSON.stringify(bundleInfo));
        return wrappedTransaction;
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple = [address.timestamp, address.medallion, address.offset];
        return await this.getTransaction().objectStore('containers').get(<MuidTuple>addressTuple);
    }

    async getEntryByKey(container?: Muid, key?: KeyType | Muid | [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const trxn = this.getTransaction();
        let clearanceTime: Timestamp = 0;
        const clearancesSearch = IDBKeyRange.bound([desiredSrc], [desiredSrc, [asOfTs]])
        const clearancesCursor = await trxn.objectStore("clearances").openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            clearanceTime = clearancesCursor.value.clearanceId[0];
        }

        let upperTuple = [asOfTs];
        const semanticKey = keyToSemanticKey(key);
        const lower = [desiredSrc];
        const upper = [desiredSrc, semanticKey, upperTuple];
        const searchRange = IDBKeyRange.bound(lower, upper);
        const entriesCursor = await trxn.objectStore("entries").index(
            "by-container-key-placement").openCursor(searchRange, "prev");
        if (entriesCursor) {
            const entry: Entry = entriesCursor.value;
            if (!sameData(entry.effectiveKey, semanticKey)) {
                return undefined;
            }
            if (entry.placementId[0] < clearanceTime) {
                // a clearance happened after this thing was placed, so treat it as gone
                return undefined;
            }
            return entry;
        }
        return undefined;
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const trxn = this.getTransaction();

        let clearanceTime: Timestamp = 0;
        const clearancesSearch = IDBKeyRange.bound([desiredSrc], [desiredSrc, [asOfTs]])
        const clearancesCursor = await trxn.objectStore("clearances").openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            clearanceTime = clearancesCursor.value.clearanceId[0];
        }

        const lower = [desiredSrc, Behavior.DIRECTORY];
        const searchRange = IDBKeyRange.lowerBound(lower);
        let cursor = await trxn.objectStore("entries").index("by-container-key-placement")
            .openCursor(searchRange, "next");
        const result = new Map();
        for (; cursor && matches(cursor.key[0], desiredSrc); cursor = await cursor.continue()) {
            const entry = <Entry>cursor.value;

            ensure(entry.behavior == Behavior.DIRECTORY || entry.behavior == Behavior.KEY_SET || entry.behavior == Behavior.ROLE ||
                entry.behavior == Behavior.PAIR_SET || entry.behavior == Behavior.PAIR_MAP);
            let key: Muid | string | number | Uint8Array | [];

            if (typeof (entry.effectiveKey) == "string" || entry.effectiveKey instanceof Uint8Array || typeof (entry.effectiveKey) == "number") {
                key = entry.effectiveKey;
            } else if (Array.isArray(entry.effectiveKey) && entry.effectiveKey.length == 3) {
                // If the key is a MuidTuple
                key = muidToString(muidTupleToMuid(entry.effectiveKey));

            } else {
                throw Error(`not sure what to do with a ${typeof (key)} key`);
            }
            ensure((typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array || typeof (key) == "object"));
            if (entry.entryId[0] < asOfTs && entry.entryId[0] >= clearanceTime) {
                if (entry.deletion) {
                    result.delete(key);
                } else {
                    result.set(key, entry);
                }
            }
        }
        return result;
    }

    async getEntriesBySourceOrTarget(vertex: Muid, source: boolean, asOf?: AsOf): Promise<Entry[]> {
        await this.ready;
        const asOfTs: Timestamp = asOf ? (await this.asOfToTimestamp(asOf)) : generateTimestamp() + 1;
        const indexable = dehydrate(vertex);
        let unfiltered: Entry[] = [];
        if (source) {
            unfiltered = await this.wrapped.getAllFromIndex("entries", "sources", indexable);
        } else {
            unfiltered = await this.wrapped.getAllFromIndex("entries", "targets", indexable);
        }
        const trxn = this.getTransaction();
        const returning: Entry[] = [];
        const removals = trxn.objectStore("removals");
        for (let i = 0; i < unfiltered.length; i++) {
            const entry: Entry = unfiltered[i];
            if (entry.placementId[0] >= asOfTs) {
                continue;
            }
            const removalsBound = IDBKeyRange.bound([entry.placementId], [entry.placementId, [asOfTs]]);
            // TODO: This seek-per-entry isn't very efficient and should be a replaced with a scan.
            const removalsCursor = await removals.index("by-removing").openCursor(removalsBound);
            if (!removalsCursor)
                returning.push(entry);
        }
        return returning;
    }

    /**
     * Returns entry data for a List.  Does it in a single pass rather than using an async generator
     * because if a user tried to await on something else between entries it would cause the IndexedDb
     * transaction to auto-close.
     * @param container to get entries for
     * @param through number to get, negative for starting from end
     * @param asOf show results as of a time in the past
     * @returns a promise of a list of ChangePairs
     */
    async getOrderedEntries(container: Muid, through = Infinity, asOf?: AsOf): Promise<Entry[]> {
        const asOfTs: Timestamp = asOf ? (await this.asOfToTimestamp(asOf)) : generateTimestamp() + 1;
        const containerId = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const lower = [containerId, 0];
        const upper = [containerId, asOfTs];
        const range = IDBKeyRange.bound(lower, upper);
        const trxn = this.getTransaction();

        let clearanceTime: Timestamp = 0;
        const clearancesSearch = IDBKeyRange.bound([containerId], [containerId, [asOfTs]])
        const clearancesCursor = await trxn.objectStore("clearances").openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            clearanceTime = clearancesCursor.value.clearanceId[0];
        }

        const entries = trxn.objectStore("entries");
        const removals = trxn.objectStore("removals");
        const returning = <Entry[]>[];
        let entriesCursor = await entries.index("by-container-key-placement").openCursor(range, through < 0 ? "prev" : "next");
        const needed = through < 0 ? -through : through + 1;
        while (entriesCursor && returning.length < needed) {
            const entry: Entry = entriesCursor.value;
            if (entry.placementId[0] >= clearanceTime) {
                const removalsBound = IDBKeyRange.bound([entry.placementId], [entry.placementId, [asOfTs]]);
                // TODO: This seek-per-entry isn't very efficient and should be a replaced with a scan.
                const removalsCursor = await removals.index("by-removing").openCursor(removalsBound);
                if (!removalsCursor) returning.push(entry);
            }
            entriesCursor = await entriesCursor.continue();
        }
        return returning;
    }

    async getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs: Timestamp = asOf ? (await this.asOfToTimestamp(asOf)) : generateTimestamp();
        const entryId = [entryMuid.timestamp ?? 0, entryMuid.medallion ?? 0, entryMuid.offset ?? 0];
        const entryRange = IDBKeyRange.bound([entryId, [0]], [entryId, [asOfTs]]);
        const trxn = this.getTransaction();
        const entryCursor = await trxn.objectStore("entries").index("locations").openCursor(entryRange, "prev");
        if (!entryCursor) {
            return undefined;
        }
        const entry: Entry = entryCursor.value;
        const removalRange = IDBKeyRange.bound([entry.placementId], [entry.placementId, [asOfTs]])
        const removalCursor = await trxn.objectStore("removals").openCursor(removalRange);
        if (removalCursor) {
            return undefined;
        }
        return entry;
    }

    // for debugging, not part of the api/interface
    async getAllEntryKeys() {
        return await this.getTransaction().objectStore("entries").getAllKeys();
    }

    // for debugging, not part of the api/interface
    async getAllEntries(): Promise<Entry[]> {
        return await this.getTransaction().objectStore("entries").getAll();
    }

    // for debugging, not part of the api/interface
    async getAllRemovals() {
        return await this.getTransaction().objectStore("removals").getAll();
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current commit, so its best if `callBack` doesn't await.
    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void) {
        await this.ready;

        // We loop through all commits and send those the peer doesn't have.
        for (let cursor = await this.getTransaction().objectStore("trxns").openCursor();
            cursor; cursor = await cursor.continue()) {
            const commitKey = <BundleInfoTuple>cursor.key;
            const commitInfo = commitKeyToInfo(commitKey);
            const commitBytes: BundleBytes = cursor.value;
            callBack(commitBytes, commitInfo);
        }
    }
}
