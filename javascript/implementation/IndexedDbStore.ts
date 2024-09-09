import { isEqual } from "lodash";
import {
    builderToMuid,
    ensure,
    generateTimestamp,
    dehydrate,
    matches,
    muidToTuple,
    sameData,
    unwrapValue,
    getActorId,
    muidTupleToString,
    muidTupleToMuid,
    verifyBundle,
    librariesReady,
} from "./utils";
import { deleteDB, IDBPDatabase, openDB, IDBPTransaction } from "idb";
import {
    ActorId,
    AsOf,
    BroadcastFunc,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChain,
    Clearance,
    Entry,
    Indexable,
    IndexedDbStoreSchema,
    ScalarKey,
    Medallion,
    Muid,
    MuidTuple,
    Removal,
    Timestamp,
    BundleView,
    KeyPair,
    Value,
} from "./typedefs";
import {
    extractContainerMuid,
    getStorageKey,
    extractMovement,
    buildPairLists,
    buildPointeeList,
    buildChainTracker,
    toStorageKey,
    bundleKeyToInfo,
    bundleInfoToKey,
    storageKeyToString,
} from "./store_utils";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, ChangeBuilder, EntryBuilder } from "./builders";
import { PromiseChainLock } from "./PromiseChainLock";
import { Retrieval } from "./Retrieval";

type Transaction = IDBPTransaction<
    IndexedDbStoreSchema,
    (
        | "trxns"
        | "chainInfos"
        | "activeChains"
        | "containers"
        | "removals"
        | "clearances"
        | "entries"
        | "identities"
        | "verifyKeys"
        | "secretKeys"
    )[],
    "readwrite" | "readonly"
>;

if (eval("typeof indexedDB") === "undefined") {
    // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");'); // hide require from webpack
}

/**
 * Uses an indexedDb to implement the Store interface.  On the server side, this will
 * be done using a shim that is only an in-memory implementation of the IndexedDb API,
 * so the LogBackedStore should be used on the server for persistence.  Most of the time
 * uses of Gink should not need to call methods on the store directly, instead just
 * pass it into the Database (or SimpleServer, etc.).
 */
export class IndexedDbStore implements Store {
    ready: Promise<void>;
    private wrapped: IDBPDatabase<IndexedDbStoreSchema>;
    private transaction: Transaction | null = null;
    private countTrxns: number = 0;
    private initialized = false;
    private processingLock = new PromiseChainLock();
    private lastCaller: string = "";
    private foundBundleCallBacks: BroadcastFunc[] = [];
    private pending: BundleInfo[] = [];
    private static readonly YEAR_2020 = new Date("2020-01-01").getTime() * 1000;

    constructor(
        indexedDbName: string,
        reset?: boolean,
        private keepingHistory = true
    ) {
        this.ready = this.initialize(indexedDbName, reset);
    }

    private async initialize(
        indexedDbName: string,
        reset: boolean
    ): Promise<void> {
        await librariesReady;
        if (reset) {
            await deleteDB(indexedDbName, {
                blocked() {
                    const msg = `Unable to delete IndexedDB database ${indexedDbName} !!!`;
                    throw new Error(msg);
                },
            });
        }
        this.wrapped = await openDB<IndexedDbStoreSchema>(indexedDbName, 1, {
            upgrade(
                db: IDBPDatabase<IndexedDbStoreSchema>,
                _oldVersion: number,
                _newVersion: number,
                _transaction
            ) {
                // info(`upgrade, oldVersion:${oldVersion}, newVersion:${newVersion}`);
                /*
                     The object store for transactions will store the raw bytes received
                     for each transaction to avoid dropping unknown fields.  Since this
                     isn't a javascript object, we'll use
                     [timestamp, medallion] to keep transactions ordered in time.
                 */
                db.createObjectStore("trxns"); // a map from BundleKey to BundleBytes

                /*
                    Stores ChainInfo objects.
                    This will keep track of which transactions have been processed per chain.
                */
                db.createObjectStore("chainInfos", {
                    keyPath: ["medallion", "chainStart"],
                });

                /*
                    Keep track of active chains this instance can write to.
                    It stores objects with two keys: "medallion" and "chainStart",
                    which have value Medallion and ChainStart respectively.
                    This could alternatively be implemented with a keys being
                    medallions and values being chainStarts, but this is a little
                    easier because the getAll() interface is a bit nicer than
                    working with the cursor interface.
                */
                db.createObjectStore("activeChains", {
                    keyPath: ["claimTime"],
                });

                /*
                    Keep track of the identities of who started each chain.
                    key: [medallion, chainStart]
                    value: identity (string)
                    Not setting keyPath since [medallion, chainStart] can't be pulled from the value
                */
                db.createObjectStore("identities");
                db.createObjectStore("verifyKeys");
                db.createObjectStore("secretKeys");

                db.createObjectStore("clearances", {
                    keyPath: ["containerId", "clearanceId"],
                });

                db.createObjectStore("containers"); // map from AddressTuple to ContainerBytes

                // the "removals" stores objects of type `Removal`
                const removals = db.createObjectStore("removals", {
                    keyPath: "removalId",
                });
                removals.createIndex("by-container-movement", [
                    "containerId",
                    "removalId",
                ]);
                removals.createIndex("by-removing", ["removing", "removalId"]);

                // The "entries" store has objects of type Entry (from typedefs)
                const entries = db.createObjectStore("entries", {
                    keyPath: "placementId",
                });
                entries.createIndex("by-container-key-placement", [
                    "containerId",
                    "storageKey",
                    "placementId",
                ]);
                entries.createIndex("by-container-name", [
                    "containerId",
                    "value",
                ]); // Useful for quickly looking up a container by its name

                // This index is used to find all properties that describe a particular container.
                entries.createIndex("by-key-placement", [
                    "storageKey",
                    "placementId",
                ]);

                // ideally the next three indexes would be partial indexes, covering only sequences and edges
                // it might be worth pulling them out into separate lookup tables.
                entries.createIndex("locations", ["entryId", "placementId"]);
                entries.createIndex("sources", [
                    "sourceList",
                    "storageKey",
                    "placementId",
                ]);
                entries.createIndex("targets", [
                    "targetList",
                    "storageKey",
                    "placementId",
                ]);
            },
        });
        this.initialized = true;
    }

    async getVerifyKey(chainInfo: [Medallion, ChainStart]): Promise<Bytes> {
        await this.ready;
        const wrappedTransaction = this.getTransaction();
        const verifyKey = await wrappedTransaction
            .objectStore("verifyKeys")
            .get(chainInfo);
        return verifyKey;
    }

    async saveKeyPair(keyPair: KeyPair): Promise<void> {
        await this.ready;
        const trxn = this.getTransaction();
        await trxn
            .objectStore("secretKeys")
            .put(keyPair.secretKey, keyPair.publicKey);
    }

    async pullKeyPair(publicKey: Bytes): Promise<KeyPair> {
        await this.ready;
        const trxn = this.getTransaction();
        const secretKey = await trxn.objectStore("secretKeys").get(publicKey);
        return { secretKey, publicKey };
    }

    private clearTransaction() {
        this.transaction = null;
    }

    private getTransaction(): Transaction {
        const stackString = new Error().stack;
        const callerLine = stackString ? stackString.split("\n")[2] : "";
        if (this.transaction === null || this.lastCaller !== callerLine) {
            this.lastCaller = callerLine;
            this.countTrxns += 1;
            this.transaction = this.wrapped.transaction(
                [
                    "entries",
                    "clearances",
                    "removals",
                    "trxns",
                    "chainInfos",
                    "activeChains",
                    "containers",
                    "identities",
                    "verifyKeys",
                    "secretKeys",
                ],
                "readwrite"
            );
            this.transaction.done.finally(() => this.clearTransaction());
        }
        return this.transaction;
    }

    getTransactionCount(): number {
        return this.countTrxns;
    }

    async dropHistory(container?: Muid, before?: AsOf): Promise<void> {
        const beforeTs = before
            ? await this.asOfToTimestamp(before)
            : generateTimestamp();
        const trxn = this.wrapped.transaction(
            ["removals", "entries"],
            "readwrite"
        );
        let removalsCursor = await trxn
            .objectStore("removals")
            .openCursor(IDBKeyRange.upperBound([beforeTs]));
        if (container) {
            const containerTuple = muidToTuple(container);
            const range = IDBKeyRange.bound(
                [containerTuple, [0]],
                [containerTuple, [beforeTs]]
            );
            removalsCursor = await trxn
                .objectStore("removals")
                .index("by-container-movement")
                .openCursor(range);
        }
        while (removalsCursor) {
            await trxn
                .objectStore("entries")
                .delete(removalsCursor.value.removing);
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
            // Interpret as number of bundles in the past.
            let cursor = await this.wrapped
                .transaction("trxns", "readonly")
                .objectStore("trxns")
                .openCursor(undefined, "prev");
            let bundlesToTraverse = -asOf;
            for (; cursor; cursor = await cursor.continue()) {
                if (--bundlesToTraverse === 0) {
                    const tuple = <BundleInfoTuple>cursor.key;
                    return tuple[0];
                }
            }
            // Looking further back then we have bundles.
            throw new Error("no bundles that far back");
        }
        throw new Error(`don't know how to interpret asOf=${asOf}`);
    }

    async getClaimedChains(): Promise<Map<Medallion, ClaimedChain>> {
        if (!this.initialized) throw new Error("not initilized");
        const objectStore = this.wrapped
            .transaction("activeChains", "readonly")
            .objectStore("activeChains");
        const items = await objectStore.getAll();
        const result: Map<Medallion, ClaimedChain> = new Map();
        let lastTs = 0;
        for (let item of items) {
            if (item.claimTime < lastTs) throw new Error("claims not in order");
            lastTs = item.claimTime;
            result.set(item.medallion, item);
        }
        return result;
    }

    async getChainIdentity(
        chainInfo: [Medallion, ChainStart]
    ): Promise<string> {
        await this.ready;
        const wrappedTransaction = this.getTransaction();
        const identity = await wrappedTransaction
            .objectStore("identities")
            .get(chainInfo);
        return identity;
    }

    private async claimChain(
        medallion: Medallion,
        chainStart: ChainStart,
        actorId?: ActorId,
        transaction?: Transaction
    ): Promise<ClaimedChain> {
        await this.ready;
        const wrappedTransaction = transaction ?? this.getTransaction();
        const claim = {
            chainStart,
            medallion,
            actorId: actorId || 0,
            claimTime: generateTimestamp(),
        };
        await wrappedTransaction.objectStore("activeChains").add(claim);
        return claim;
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        const chainInfos = await this.getChainInfos();
        const chainTracker = buildChainTracker(chainInfos);
        return chainTracker;
    }

    private async getChainInfos(): Promise<Array<BundleInfo>> {
        await this.ready;
        return await this.getTransaction().objectStore("chainInfos").getAll();
    }

    addBundle(bundleView: BundleView, claimChain?: boolean): Promise<boolean> {
        if (!this.initialized) throw new Error("need to await on store.ready");
        return this.processingLock
            .acquireLock()
            .then(async (unlock) => {
                const trxn = this.getTransaction();
                let added = false;
                try {
                    added = await this.addBundleHelper(
                        trxn,
                        bundleView,
                        claimChain
                    );
                } finally {
                    unlock();
                }
                await trxn.done;
                return added;
            })
            .catch((e) => {
                throw e;
            });
    }

    private async addBundleHelper(
        trxn: Transaction,
        bundleView: BundleView,
        claimChain?: boolean
    ): Promise<boolean> {
        const bundleInfo = bundleView.info;
        const bundleBuilder = bundleView.builder;
        const { timestamp, medallion, chainStart, priorTime } = bundleInfo;
        const oldChainInfo: BundleInfo = await trxn
            .objectStore("chainInfos")
            .get([medallion, chainStart]);
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return false;
            }
            if (oldChainInfo?.timestamp !== priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close?
                throw new Error(
                    `missing ${JSON.stringify(bundleInfo)}, have ${JSON.stringify(oldChainInfo)}`
                );
            }
            const priorHash = bundleBuilder.getPriorHash();
            if (
                !priorHash ||
                priorHash.length != 32 ||
                !sameData(priorHash, oldChainInfo.hashCode)
            )
                throw new Error("prior hash is invalid");
        }
        const identity = bundleBuilder.getIdentity();
        // If this is a new chain, save the identity & claim this chain
        if (claimChain) {
            ensure(
                bundleInfo.timestamp === bundleInfo.chainStart,
                "timestamp !== chainstart"
            );
            ensure(identity, "identity required to start a chain");
            await this.claimChain(
                bundleInfo.medallion,
                bundleInfo.chainStart,
                getActorId(),
                trxn
            );
        }
        let verifyKey: Bytes;
        const chainInfo: [Medallion, ChainStart] = [
            bundleInfo.medallion,
            bundleInfo.chainStart,
        ];

        if (bundleInfo.chainStart === bundleInfo.timestamp) {
            ensure(identity, `identity required to start a chain`);
            await trxn.objectStore("identities").add(identity, chainInfo);
            verifyKey = bundleBuilder.getVerifyKey();
            await trxn.objectStore("verifyKeys").put(verifyKey, chainInfo);
        } else {
            ensure(
                !identity,
                `cannot have identity in non-chain-start bundle - ${identity}`
            );
            verifyKey = await trxn.objectStore("verifyKeys").get(chainInfo);
        }
        verifyBundle(bundleView.bytes, verifyKey);
        await trxn.objectStore("chainInfos").put(bundleInfo);
        // Only timestamp and medallion are required for uniqueness, the others just added to make
        // the getNeededTransactions faster by not requiring parsing again.
        const bundleKey: BundleInfoTuple = bundleInfoToKey(bundleInfo);
        await trxn.objectStore("trxns").add(bundleView.bytes, bundleKey);
        const changesList: Array<ChangeBuilder> =
            bundleBuilder.getChangesList();
        for (let index = 0; index < changesList.length; index++) {
            const offset = index + 1;
            const changeBuilder = changesList[index];
            ensure(offset > 0);
            const changeAddressTuple: MuidTuple = [
                timestamp,
                medallion,
                offset,
            ];
            const changeAddress: Muid = { timestamp, medallion, offset };
            if (changeBuilder.hasContainer()) {
                const containerBytes = changeBuilder
                    .getContainer()
                    .serializeBinary();
                await trxn
                    .objectStore("containers")
                    .add(containerBytes, changeAddressTuple);
                continue;
            }
            if (changeBuilder.hasEntry()) {
                const entryBuilder: EntryBuilder = changeBuilder.getEntry();
                let containerId: MuidTuple = [0, 0, 0];
                if (entryBuilder.hasContainer()) {
                    containerId = extractContainerMuid(
                        entryBuilder,
                        bundleInfo
                    );
                }
                const storageKey = getStorageKey(entryBuilder, changeAddress);
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
                    [sourceList, targetList] = buildPairLists(
                        entryBuilder,
                        bundleInfo
                    );
                }
                const value = entryBuilder.hasValue()
                    ? unwrapValue(entryBuilder.getValue())
                    : undefined;
                const expiry = entryBuilder.getExpiry() || undefined;
                const deletion = entryBuilder.getDeletion();
                const entry: Entry = {
                    behavior,
                    containerId,
                    storageKey,
                    entryId,
                    pointeeList,
                    value,
                    expiry,
                    deletion,
                    placementId,
                    sourceList,
                    targetList,
                };
                if (
                    !(
                        behavior === Behavior.SEQUENCE ||
                        behavior === Behavior.EDGE_TYPE
                    )
                ) {
                    const range = IDBKeyRange.bound(
                        [containerId, storageKey],
                        [containerId, storageKey, placementId]
                    );
                    const search = await trxn
                        .objectStore("entries")
                        .index("by-container-key-placement")
                        .openCursor(range, "prev");
                    if (search) {
                        if (this.keepingHistory) {
                            const removal: Removal = {
                                removing: search.value.placementId,
                                removalId: placementId,
                                containerId: containerId,
                                dest: 0,
                                entryId: search.value.entryId,
                            };
                            await trxn.objectStore("removals").add(removal);
                        } else {
                            await trxn
                                .objectStore("entries")
                                .delete(search.value.placementId);
                        }
                    }
                }
                await trxn.objectStore("entries").add(entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                const movement = extractMovement(
                    changeBuilder,
                    bundleInfo,
                    offset
                );
                const { entryId, movementId, containerId, dest, purge } =
                    movement;
                const range = IDBKeyRange.bound(
                    [entryId, [0]],
                    [entryId, [Infinity]]
                );
                const search = await trxn
                    .objectStore("entries")
                    .index("locations")
                    .openCursor(range, "prev");
                if (!search) {
                    continue; // Nothing found to remove.
                }
                const found: Entry = search.value;
                if (dest !== 0) {
                    const destEntry: Entry = {
                        behavior: found.behavior,
                        containerId: found.containerId,
                        storageKey: dest,
                        entryId: found.entryId,
                        pointeeList: found.pointeeList,
                        value: found.value,
                        expiry: found.expiry,
                        deletion: found.deletion,
                        placementId: movementId,
                        sourceList: found.sourceList,
                        targetList: found.targetList,
                    };
                    await trxn.objectStore("entries").add(destEntry);
                }
                if (purge || !this.keepingHistory) {
                    search.delete();
                } else {
                    const removal: Removal = {
                        containerId,
                        removalId: movementId,
                        dest,
                        entryId,
                        removing: found.placementId,
                    };
                    await trxn.objectStore("removals").add(removal);
                }
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(
                    clearanceBuilder.getContainer(),
                    { timestamp, medallion, offset }
                );
                const containerMuidTuple: MuidTuple = [
                    container.timestamp,
                    container.medallion,
                    container.offset,
                ];
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    const onePast = [
                        container.timestamp,
                        container.medallion,
                        container.offset + 1,
                    ];
                    const range = IDBKeyRange.bound(
                        [containerMuidTuple],
                        [onePast],
                        false,
                        true
                    );
                    let entriesCursor = await trxn
                        .objectStore("entries")
                        .index("by-container-key-placement")
                        .openCursor(range);
                    while (entriesCursor) {
                        await entriesCursor.delete();
                        entriesCursor = await entriesCursor.continue();
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    let clearancesCursor = await trxn
                        .objectStore("clearances")
                        .openCursor(range);
                    while (clearancesCursor) {
                        await clearancesCursor.delete();
                        clearancesCursor = await clearancesCursor.continue();
                    }
                    // When doing a purging clear, remove all removals for the container.
                    let removalsCursor = await trxn
                        .objectStore("removals")
                        .index("by-container-movement")
                        .openCursor(range);
                    while (removalsCursor) {
                        await removalsCursor.delete();
                        removalsCursor = await removalsCursor.continue();
                    }
                }
                const clearance: Clearance = {
                    containerId: containerMuidTuple,
                    clearanceId: changeAddressTuple,
                    purging: clearanceBuilder.getPurge(),
                };
                await trxn.objectStore("clearances").add(clearance);
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        return true;
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple = [
            address.timestamp,
            address.medallion,
            address.offset,
        ];
        return await this.wrapped
            .transaction("containers", "readonly")
            .objectStore("containers")
            .get(<MuidTuple>addressTuple);
    }

    async getEntryByKey(
        container?: Muid,
        key?: ScalarKey | Muid | [Muid, Muid],
        asOf?: AsOf
    ): Promise<Entry | undefined> {
        const asOfTs = asOf ? await this.asOfToTimestamp(asOf) : Infinity;
        const desiredSrc = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const trxn = this.wrapped.transaction(
            ["clearances", "entries"],
            "readonly"
        );
        let clearanceTime: Timestamp = 0;
        const clearancesSearch = IDBKeyRange.bound(
            [desiredSrc],
            [desiredSrc, [asOfTs]]
        );
        const clearancesCursor = await trxn
            .objectStore("clearances")
            .openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            clearanceTime = clearancesCursor.value.clearanceId[0];
        }

        let upperTuple = [asOfTs];
        const storageKey = toStorageKey(key);
        const lower = [desiredSrc];
        const upper = [desiredSrc, storageKey, upperTuple];
        const searchRange = IDBKeyRange.bound(lower, upper);
        const entriesCursor = await trxn
            .objectStore("entries")
            .index("by-container-key-placement")
            .openCursor(searchRange, "prev");
        if (entriesCursor) {
            const entry: Entry = entriesCursor.value;
            if (!sameData(entry.storageKey, storageKey)) {
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

    async getClearanceTime(
        trxn: Transaction,
        muidTuple: MuidTuple,
        asOfTs: Timestamp
    ): Promise<Timestamp> {
        const clearancesSearch = IDBKeyRange.bound(
            [muidTuple],
            [muidTuple, [asOfTs]]
        );
        const clearancesCursor = await trxn
            .objectStore("clearances")
            .openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            return <Timestamp>clearancesCursor.value.clearanceId[0];
        }
        return <Timestamp>0;
    }

    async getKeyedEntries(
        container: Muid,
        asOf?: AsOf
    ): Promise<Map<string, Entry>> {
        const asOfTs = asOf ? await this.asOfToTimestamp(asOf) : Infinity;
        const desiredSrc: MuidTuple = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const trxn = this.wrapped.transaction(
            ["clearances", "entries"],
            "readonly"
        );
        const clearanceTime = await this.getClearanceTime(
            <Transaction>(<unknown>trxn),
            desiredSrc,
            asOfTs
        );
        const lower = [desiredSrc];
        const searchRange = IDBKeyRange.lowerBound(lower);
        let cursor = await trxn
            .objectStore("entries")
            .index("by-container-key-placement")
            .openCursor(searchRange, "next");
        const result = new Map();
        for (
            ;
            cursor && matches(cursor.key[0], desiredSrc);
            cursor = await cursor.continue()
        ) {
            const entry = <Entry>cursor.value;

            ensure(
                entry.behavior === Behavior.DIRECTORY ||
                    entry.behavior === Behavior.KEY_SET ||
                    entry.behavior === Behavior.GROUP ||
                    entry.behavior === Behavior.PAIR_SET ||
                    entry.behavior === Behavior.PAIR_MAP ||
                    entry.behavior === Behavior.PROPERTY
            );
            const key = storageKeyToString(entry.storageKey);
            if (
                entry.entryId[0] < asOfTs &&
                entry.entryId[0] >= clearanceTime
            ) {
                if (entry.deletion) {
                    result.delete(key);
                } else {
                    result.set(key, entry);
                }
            }
        }
        return result;
    }

    async getEntriesBySourceOrTarget(
        vertex: Muid,
        source: boolean,
        asOf?: AsOf
    ): Promise<Entry[]> {
        await this.ready;
        const asOfTs: Timestamp = asOf
            ? await this.asOfToTimestamp(asOf)
            : generateTimestamp() + 1;
        const indexable = dehydrate(vertex);
        const trxn = this.wrapped.transaction(
            ["clearances", "entries", "removals"],
            "readonly"
        );
        const clearanceTime = await this.getClearanceTime(
            <Transaction>(<unknown>trxn),
            indexable,
            asOfTs
        );
        const lower = [[indexable], -Infinity];
        const upper = [[indexable], +Infinity];
        const searchRange = IDBKeyRange.bound(lower, upper);
        let entriesCursor = await trxn
            .objectStore("entries")
            .index(source ? "sources" : "targets")
            .openCursor(searchRange);
        const returning: Entry[] = [];
        const removals = trxn.objectStore("removals");
        for (; entriesCursor; entriesCursor = await entriesCursor.continue()) {
            const entry: Entry = entriesCursor.value;
            if (
                entry.placementId[0] >= asOfTs ||
                entry.placementId[0] < clearanceTime
            )
                continue;
            const removalsBound = IDBKeyRange.bound(
                [entry.placementId],
                [entry.placementId, [asOfTs]]
            );
            // TODO: This seek-per-entry isn't very efficient and should be a replaced with a scan.
            const removalsCursor = await removals
                .index("by-removing")
                .openCursor(removalsBound);
            if (!removalsCursor) returning.push(entry);
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
    async getOrderedEntries(
        container: Muid,
        through = Infinity,
        asOf?: AsOf
    ): Promise<Map<string, Entry>> {
        const asOfTs: Timestamp = asOf
            ? await this.asOfToTimestamp(asOf)
            : generateTimestamp() + 1;
        const containerId = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const lower = [containerId, 0];
        const upper = [containerId, asOfTs];
        const range = IDBKeyRange.bound(lower, upper);
        const trxn = this.wrapped.transaction(
            ["clearances", "entries", "removals"],
            "readonly"
        );

        let clearanceTime: Timestamp = 0;
        const clearancesSearch = IDBKeyRange.bound(
            [containerId],
            [containerId, [asOfTs]]
        );
        const clearancesCursor = await trxn
            .objectStore("clearances")
            .openCursor(clearancesSearch, "prev");
        if (clearancesCursor) {
            clearanceTime = clearancesCursor.value.clearanceId[0];
        }

        const entries = trxn.objectStore("entries");
        const removals = trxn.objectStore("removals");
        const returning = new Map<string, Entry>();
        let entriesCursor = await entries
            .index("by-container-key-placement")
            .openCursor(range, through < 0 ? "prev" : "next");
        const needed = through < 0 ? -through : through + 1;
        while (entriesCursor && returning.size < needed) {
            const entry: Entry = entriesCursor.value;
            if (entry.placementId[0] >= clearanceTime) {
                const removalsBound = IDBKeyRange.bound(
                    [entry.placementId],
                    [entry.placementId, [asOfTs]]
                );
                // TODO: This seek-per-entry isn't very efficient and should be a replaced with a scan.
                const removalsCursor = await removals
                    .index("by-removing")
                    .openCursor(removalsBound);
                if (!removalsCursor) {
                    const placementIdStr = muidTupleToString(entry.placementId);
                    const returningKey = `${entry.storageKey},${placementIdStr}`;
                    returning.set(returningKey, entry);
                }
            }
            entriesCursor = await entriesCursor.continue();
        }
        return returning;
    }

    async getEntryById(
        entryMuid: Muid,
        asOf?: AsOf
    ): Promise<Entry | undefined> {
        const asOfTs: Timestamp = asOf
            ? await this.asOfToTimestamp(asOf)
            : generateTimestamp();
        const entryId = [
            entryMuid.timestamp ?? 0,
            entryMuid.medallion ?? 0,
            entryMuid.offset ?? 0,
        ];
        const entryRange = IDBKeyRange.bound(
            [entryId, [0]],
            [entryId, [asOfTs]]
        );
        const trxn = this.wrapped.transaction(
            ["entries", "removals"],
            "readonly"
        );
        const entryCursor = await trxn
            .objectStore("entries")
            .index("locations")
            .openCursor(entryRange, "prev");
        if (!entryCursor) {
            return undefined;
        }
        const entry: Entry = entryCursor.value;
        const removalRange = IDBKeyRange.bound(
            [entry.placementId],
            [entry.placementId, [asOfTs]]
        );
        const removalCursor = await trxn
            .objectStore("removals")
            .openCursor(removalRange);
        if (removalCursor) {
            return undefined;
        }
        return entry;
    }

    async getContainersByName(name: string, asOf?: AsOf): Promise<Muid[]> {
        const asOfTs = asOf ? await this.asOfToTimestamp(asOf) : Infinity;
        const desiredSrc: MuidTuple = [-1, -1, Behavior.PROPERTY];
        const trxn = this.wrapped.transaction(
            ["clearances", "entries", "removals"],
            "readonly"
        );
        const clearanceTime = await this.getClearanceTime(
            <Transaction>(<unknown>trxn),
            desiredSrc,
            asOfTs
        );
        const lower = [desiredSrc, name];
        const searchRange = IDBKeyRange.lowerBound(lower);
        let cursor = await trxn
            .objectStore("entries")
            .index("by-container-name")
            .openCursor(searchRange, "next");
        const result = [];

        for (
            ;
            cursor &&
            matches(cursor.key[0], desiredSrc) &&
            cursor.key[1] === name;
            cursor = await cursor.continue()
        ) {
            const entry = <Entry>cursor.value;
            ensure(entry.behavior === Behavior.PROPERTY);
            const range = IDBKeyRange.lowerBound([entry.entryId]);
            const removal = await trxn
                .objectStore("removals")
                .index("by-removing")
                .openCursor(range);
            if (
                removal &&
                removal.value.entryId.toString() === entry.entryId.toString()
            ) {
                continue;
            }
            let key: [number, number, number];
            if (
                Array.isArray(entry.storageKey) &&
                entry.storageKey.length === 3
            ) {
                key = entry.storageKey;
            }
            ensure(
                key,
                "Unexpected storageKey for property: " + entry.storageKey
            );

            if (
                entry.entryId[0] < asOfTs &&
                entry.entryId[0] >= clearanceTime &&
                !entry.deletion
            ) {
                result.push(muidTupleToMuid(key));
            }
        }
        return result;
    }

    async getContainerProperties(
        containerMuid: Muid,
        asOf?: AsOf
    ): Promise<Map<string, Value>> {
        const asOfTs: Timestamp = asOf
            ? await this.asOfToTimestamp(asOf)
            : generateTimestamp();
        const containerTuple = muidToTuple(containerMuid);

        const txn = this.wrapped.transaction(
            ["entries", "clearances"],
            "readonly"
        );
        const range = IDBKeyRange.bound(
            [containerTuple],
            [containerTuple, [asOfTs]]
        );
        let cursor = await txn
            .objectStore("entries")
            .index("by-key-placement")
            .openCursor(range);
        const result: Map<string, Value> = new Map();
        for (
            ;
            cursor &&
            Array.isArray(cursor.key[0]) &&
            isEqual(cursor.key[0], containerTuple);
            cursor = await cursor.continue()
        ) {
            const entry = <Entry>cursor.value;
            ensure(entry.behavior === Behavior.PROPERTY);
            ensure(isEqual(entry.storageKey, containerTuple));
            if (
                !(
                    Array.isArray(entry.storageKey) &&
                    entry.storageKey.length === 3
                )
            ) {
                // This is also kinda just to keep typescript happy.
                // If storageKey is equal to containerMuid, this will never run.
                throw new Error("Unexpected storageKey for property");
            }
            const clearanceTime = await this.getClearanceTime(
                txn,
                muidToTuple(muidTupleToMuid(entry.containerId)),
                asOfTs
            );
            if (
                entry.entryId[0] < asOfTs &&
                entry.entryId[0] >= clearanceTime
            ) {
                if (!entry.deletion) {
                    result.set(
                        muidTupleToString(entry.containerId),
                        entry.value
                    );
                }
            }
        }
        return result;
    }

    // for debugging, not part of the api/interface
    async getAllEntryKeys() {
        return await this.wrapped
            .transaction("entries", "readonly")
            .objectStore("entries")
            .getAllKeys();
    }

    // for debugging, not part of the api/interface
    async getAllEntries(): Promise<Entry[]> {
        return await this.wrapped
            .transaction("entries", "readonly")
            .objectStore("entries")
            .getAll();
    }

    // for debugging, not part of the api/interface
    async getAllRemovals() {
        return await this.wrapped
            .transaction("removals", "readonly")
            .objectStore("removals")
            .getAll();
    }

    // for debugging, not part of the api/interface
    async getAllContainerTuples() {
        return await this.wrapped
            .transaction("containers", "readonly")
            .objectStore("containers")
            .getAllKeys();
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current bundle, so its best if `callBack` doesn't await.
    async getBundles(callBack: (bundle: BundleView) => void) {
        await this.ready;

        // We loop through all bundles and send those the peer doesn't have.
        for (
            let cursor = await this.wrapped
                .transaction("trxns", "readonly")
                .objectStore("trxns")
                .openCursor();
            cursor;
            cursor = await cursor.continue()
        ) {
            const bundleKey = <BundleInfoTuple>cursor.key;
            const bundleInfo = bundleKeyToInfo(bundleKey);
            const bundleBytes: BundleBytes = cursor.value;
            callBack(new Retrieval({ bundleBytes, bundleInfo }));
        }
    }

    addFoundBundleCallBack(callback: BroadcastFunc): void {
        this.foundBundleCallBacks.push(callback);
    }
}
