import {ensure, matches, generateTimestamp, sameData, unwrapKey, unwrapValue} from "./utils";
import {deleteDB, IDBPDatabase, openDB} from 'idb';
import {
    AsOf,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChains,
    Entry,
    KeyType,
    Medallion,
    Muid,
    MuidTuple,
    Offset,
    SeenThrough,
    Timestamp,
    Removal,
} from "./typedefs";
import {ChainTracker} from "./ChainTracker";
import {Store} from "./Store";
import {Behavior, BundleBuilder, ChangeBuilder, EntryBuilder, MovementBuilder, MuidBuilder} from "./builders";

if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
}

/**
 * Uses an indexedDb to implement the Store interface.  On the server side, this will
 * be done using a shim that is only an in-memory implementation of the IndexedDb API,
 * so the LogBackedStore should be used on the server for persistence.  Most of the time
 * uses of Gink should not need to call methods on the store directly, instead just
 * pass it into the GinkInstance (or SimpleServer, etc).
 */
export class IndexedDbStore implements Store {

    ready: Promise<void>;
    private wrapped: IDBPDatabase;
    private static readonly YEAR_2020 = (new Date("2020-01-01")).getTime() * 1000;

    constructor(indexedDbName = "gink-default", reset = false) {
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
        this.wrapped = await openDB(indexedDbName, 1, {
            upgrade(db: IDBPDatabase, _oldVersion: number, _newVersion: number, _transaction) {
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
                db.createObjectStore('chainInfos', {keyPath: ["medallion", "chainStart"]});

                /*
                    Keep track of active chains this instance can write to.
                    It stores objects with two keys: "medallion" and "chainStart",
                    which have value Medallion and ChainStart respectively.
                    This could alternatively be implemented with a keys being
                    medallions and values being chainStarts, but this is a little
                    easier because the getAll() interface is a bit nicer than
                    working with the cursor interface.
                */
                db.createObjectStore('activeChains', {keyPath: "medallion"});

                db.createObjectStore('containers'); // map from AddressTuple to ContainerBytes

                // the "removals" stores objects of type `Removal`
                db.createObjectStore('removals', {keyPath: ["removing", "movementId"]});

                // The "entries" store has objects of type Entry (from typedefs)
                const entries = db.createObjectStore('entries',
                    {keyPath: ["containerId", "effectiveKey", "placementId"]});

                entries.createIndex("pointees", "pointeeList", {multiEntry: true, unique: false});
                entries.createIndex("locations", ["entryId", "placementId"]);
            },
        });
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        await this.ready;
        const asTuple = <MuidTuple>[pointingTo.timestamp, pointingTo.medallion, pointingTo.offset];
        return this.wrapped.getAllFromIndex("entries", "pointees", asTuple);
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
            let cursor = await this.wrapped.transaction(["trxns"]).objectStore("trxns").openCursor(undefined, "prev");
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
        await this.ready;
        const objectStore = this.wrapped.transaction("activeChains").objectStore("activeChains");
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
        const wrappedTransaction = this.wrapped.transaction(['activeChains'], 'readwrite');
        await wrappedTransaction.objectStore('activeChains').add({chainStart, medallion});
        await wrappedTransaction.done;
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        const hasMap: ChainTracker = new ChainTracker({});
        (await this.getChainInfos()).map((value) => {
            hasMap.markAsHaving(value);
        });
        return hasMap;
    }

    async getSeenThrough(key: [Medallion, ChainStart]): Promise<SeenThrough> {
        await this.ready;
        const commitInfo = await this.wrapped.transaction(['chainInfos']).objectStore('chainInfos').get(key);
        return commitInfo.timestamp;
    }

    private async getChainInfos(): Promise<Array<BundleInfo>> {
        await this.ready;
        return await this.wrapped.transaction(['chainInfos']).objectStore('chainInfos').getAll();
    }

    private static extractCommitInfo(bundleData: Uint8Array | BundleBuilder): BundleInfo {
        if (bundleData instanceof Uint8Array) {
            bundleData = <BundleBuilder>BundleBuilder.deserializeBinary(bundleData);
        }
        return {
            timestamp: bundleData.getTimestamp(),
            medallion: bundleData.getMedallion(),
            chainStart: bundleData.getChainStart(),
            priorTime: bundleData.getPrevious() || undefined,
            comment: bundleData.getComment() || undefined,
        };
    }

    async addBundle(bundleBytes: BundleBytes): Promise<[BundleInfo, boolean]> {
        await this.ready;
        const bundleBuilder = <BundleBuilder>BundleBuilder.deserializeBinary(bundleBytes);
        const bundleInfo = IndexedDbStore.extractCommitInfo(bundleBuilder);
        const {timestamp, medallion, chainStart, priorTime} = bundleInfo;
        const objectStores = ['trxns', 'chainInfos', 'containers', 'entries', 'removals'];
        const wrappedTransaction = this.wrapped.transaction(objectStores, 'readwrite');
        const oldChainInfo: BundleInfo = await wrappedTransaction.objectStore("chainInfos").get([medallion, chainStart]);
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return [bundleInfo, false];
            }
            if (oldChainInfo?.timestamp != priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close?
                throw new Error(`missing prior chain entry for ${bundleInfo}, have ${oldChainInfo}`);
            }
        }
        await wrappedTransaction.objectStore("chainInfos").put(bundleInfo);
        // Only timestamp and medallion are required for uniqueness, the others just added to make
        // the getNeededTransactions faster by not requiring parsing again.
        const commitKey: BundleInfoTuple = IndexedDbStore.commitInfoToKey(bundleInfo);
        await wrappedTransaction.objectStore("trxns").add(bundleBytes, commitKey);
        const changesMap: Map<Offset, ChangeBuilder> = bundleBuilder.getChangesMap();
        for (const [offset, changeBuilder] of changesMap.entries()) {
            ensure(offset > 0);
            if (changeBuilder.hasContainer()) {
                const addressTuple = [timestamp, medallion, offset];
                const containerBytes = changeBuilder.getContainer().serializeBinary();
                await wrappedTransaction.objectStore("containers").add(containerBytes, addressTuple);
                continue;
            }
            if (changeBuilder.hasEntry()) {
                const entryBuilder: EntryBuilder = changeBuilder.getEntry();
                // TODO(https://github.com/google/gink/issues/55): explain root
                const containerId: MuidTuple = [0, 0, 0];
                if (entryBuilder.hasContainer()) {
                    const srcMuid: MuidBuilder = entryBuilder.getContainer();
                    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }
                const behavior: Behavior = entryBuilder.getBehavior();
                let effectiveKey: KeyType | Timestamp | MuidTuple | [];
                if (behavior == Behavior.DIRECTORY) {
                    ensure(entryBuilder.hasKey());
                    effectiveKey = unwrapKey(entryBuilder.getKey());
                } else if (behavior == Behavior.SEQUENCE) {
                    effectiveKey = entryBuilder.getEffective()  ||  timestamp;
                } else if (behavior == Behavior.BOX) {
                    effectiveKey = [];
                } else {
                    throw new Error(`unexpected behavior: ${behavior}`)
                }
                const entryId: MuidTuple = [timestamp, medallion, offset];
                const placementId: MuidTuple = entryId;
                const pointeeList = <MuidTuple[]>[];
                if (entryBuilder.hasPointee()) {
                    const pointeeMuidBuilder: MuidBuilder = entryBuilder.getPointee();
                    const pointee = <MuidTuple>[
                        pointeeMuidBuilder.getTimestamp() || bundleInfo.timestamp,
                        pointeeMuidBuilder.getMedallion() || bundleInfo.medallion,
                        pointeeMuidBuilder.getOffset(),
                    ];
                    pointeeList.push(pointee);
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
                };
                //TODO: add code to add expires to existing directory entries on insert
                await wrappedTransaction.objectStore("entries").add(entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                //TODO(https://github.com/google/gink/issues/57): When not keeping history, apply exits then discard.
                const movementBuilder: MovementBuilder = changeBuilder.getMovement();
                const entryMuid = movementBuilder.getEntry();
                const entryId: MuidTuple = [
                    entryMuid.getTimestamp() || timestamp,
                    entryMuid.getMedallion() || medallion,
                    entryMuid.getOffset()];
                const movementId: MuidTuple = [timestamp, medallion, offset];
                const dest = movementBuilder.getDest();
                const containerId: MuidTuple = [0, 0, 0];
                if (movementBuilder.hasContainer()) {
                    const srcMuid: MuidBuilder = movementBuilder.getContainer();
                    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }

                const range = IDBKeyRange.bound([entryId, [0]], [entryId, [Infinity]]);
                const search = await wrappedTransaction.objectStore("entries").index("locations").openCursor(range, "prev");
                if (! search) {
                    continue; // Nothing found to remove.
                }
                const found: Entry = search.value;
                const removal: Removal = {
                    containerId,
                    movementId,
                    dest,
                    entryId,
                    removing: found.placementId,
                };
                //TODO: add code to actually delete entries when not keeping full history
                await wrappedTransaction.objectStore("removals").add(removal);
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        await wrappedTransaction.done;
        return [bundleInfo, true];
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple = [address.timestamp, address.medallion, address.offset];
        return await this.wrapped.transaction(['containers']).objectStore('containers').get(<MuidTuple>addressTuple);
    }

    async getEntryByKey(container?: Muid, key?: KeyType, asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        let semanticKey: KeyType | [] = [];
        let upperTuple = [asOfTs];
        if (typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array) {
            semanticKey = key;
        }
        const lower = [desiredSrc];
        const upper = [desiredSrc, semanticKey, upperTuple];
        const searchRange = IDBKeyRange.bound(lower, upper);
        const trxn = this.wrapped.transaction(["entries"]);
        const entriesCursor = await trxn.objectStore("entries").openCursor(searchRange, "prev");
        if (entriesCursor) {
            const entry: Entry = entriesCursor.value;
            if (!sameData(entry.effectiveKey, semanticKey)) {
                return undefined;
            }
            return entry;
        }
        return undefined;
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const lower = [desiredSrc, Behavior.DIRECTORY];
        const searchRange = IDBKeyRange.lowerBound(lower);
        let cursor = await this.wrapped.transaction(["entries"]).objectStore("entries").openCursor(searchRange, "next");
        const result = new Map();
        for (; cursor && matches(cursor.key[0], desiredSrc); cursor = await cursor.continue()) {
            const entry = <Entry>cursor.value;
            ensure(entry.behavior == Behavior.DIRECTORY);
            const key = entry.effectiveKey;
            ensure((typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array));
            if (entry.entryId[0] < asOfTs) {
                if (entry.deletion) {
                    result.delete(key);
                } else {
                    result.set(key, entry);
                }
            }
        }
        return result;
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
        const trxn = this.wrapped.transaction(["entries", "removals"]);
        const entries = trxn.objectStore("entries");
        const removals = trxn.objectStore("removals");
        const returning = <Entry[]>[];
        let entriesCursor = await entries.openCursor(range, through < 0 ? "prev" : "next");
        const needed = through < 0 ? -through : through + 1;
        while (entriesCursor && returning.length < needed) {
            //TODO(https://github.com/google/gink/issues/58): Handle multi-exit
            const entry: Entry = entriesCursor.value;
            const removalsBound = IDBKeyRange.bound([entry.placementId], [entry.placementId, [asOfTs]]);
            // TODO: This seek-per-entry isn't very efficient and should be a replaced with a scan.
            const removalsCursor = await removals.openCursor(removalsBound);
            if (! removalsCursor) returning.push(entry);
            entriesCursor = await entriesCursor.continue();
        }
        return returning;
    }

    async getEntryById(container: Muid, entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs: Timestamp = asOf ? (await this.asOfToTimestamp(asOf)) : generateTimestamp();
        const entryId = [entryMuid.timestamp ?? 0, container.medallion ?? 0, container.offset ?? 0];
        const entryRange = IDBKeyRange.bound([entryId, [0]], [entryId, [asOfTs]]);
        const trxn = this.wrapped.transaction(["entries", "removals"]);
        const entryCursor = await trxn.objectStore("entries").index("locations").openCursor(entryRange, "prev");
        if (! entryCursor) {
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

    private static commitKeyToInfo(commitKey: BundleInfoTuple) {
        return {
            timestamp: commitKey[0],
            medallion: commitKey[1],
            chainStart: commitKey[2],
            priorTime: commitKey[3],
            comment: commitKey[4],
        };
    }

    private static commitInfoToKey(commitInfo: BundleInfo): BundleInfoTuple {
        return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
            commitInfo.priorTime || 0, commitInfo.comment || ""];
    }

    // for debugging, not part of the api/interface
    async getAllEntryKeys() {
        return await this.wrapped.transaction(["entries"]).objectStore("entries").getAllKeys();
    }

    // for debugging, not part of the api/interface
    async getAllEntries() {
        return await this.wrapped.transaction(["entries"]).objectStore("entries").getAll();
    }

    // for debugging, not part of the api/interface
    async getAllRemovals() {
        return await this.wrapped.transaction(["removals"]).objectStore("removals").getAll();
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current commit, so its best if `callBack` doesn't await.
    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void) {
        await this.ready;

        // We loop through all commits and send those the peer doesn't have.
        for (let cursor = await this.wrapped.transaction("trxns").objectStore("trxns").openCursor();
             cursor; cursor = await cursor.continue()) {
            const commitKey = <BundleInfoTuple>cursor.key;
            const commitInfo = IndexedDbStore.commitKeyToInfo(commitKey);
            const commitBytes: BundleBytes = cursor.value;
            callBack(commitBytes, commitInfo);
        }
    }
}
