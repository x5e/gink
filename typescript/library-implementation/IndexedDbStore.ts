import { ensure, matches, unwrapKey, unwrapValue } from "./utils";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
}
import { openDB, deleteDB, IDBPDatabase } from 'idb';
import {
    ChangeSetBytes, Medallion, ChainStart, ChangeSetInfoTuple, Entry,
    ClaimedChains, SeenThrough, Offset, Bytes, KeyType, Timestamp, EntryType,
    ChangeSetInfo, Muid, AsOf, MuidTuple, 
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Change as ChangeBuilder } from "change_pb";
import { Exit as ExitBuilder } from "exit_pb";
import { ChangeSet as ChangeSetBuilder } from "change_set_pb";
import { Entry as EntryBuilder } from "entry_pb";
import { Muid as MuidBuilder } from "muid_pb";
import { Store } from "./Store";


export class IndexedDbStore implements Store {

    initialized: Promise<void>;
    private wrapped: IDBPDatabase;
    private static readonly YEAR_2020 = (new Date("2020-01-01")).getTime() * 1000;

    constructor(indexedDbName = "gink-default", reset = false) {
        this.initialized = this.initialize(indexedDbName, reset);
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
                db.createObjectStore('chainInfos', { keyPath: ["medallion", "chainStart"] });

                /*
                    Keep track of active chains this instance can write to.
                    Stores objects with two keys: "medallion" and "chainStart",
                    which have value Medallion and ChainStart respectively.
                    This could alternatively be implemented with a keys being
                    medallions and values being chainStarts, but this is a little
                    bit easier because the getAll() interface is a bit nicer than
                    working with the cursor interface.
                */
                db.createObjectStore('activeChains', { keyPath: "medallion" });

                db.createObjectStore('containers'); // map from AddressTuple to ContainerBytes
                db.createObjectStore('exits', { keyPath: ["containerId", "entryType", "empty", "entryId", "exitId"] });
                const entries = db.createObjectStore('entries', { keyPath: ["containerId", "entryType", "semanticKey", "entryId"] });
                entries.createIndex("pointees", "pointee", { multiEntry: true, unique: false });
            },
        });
    }

    async close() {
        try {
            await this.initialized;
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
                    const tuple = <ChangeSetInfoTuple>cursor.key
                    return tuple[0];
                }
            }
            // Looking further back then we have commits.
            throw new Error("no commits that far back");
        }
        throw new Error(`don't know how to interpret asOf=${asOf}`);
    }

    async getClaimedChains(): Promise<ClaimedChains> {
        await this.initialized;
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
        await this.initialized;
        const wrappedTransaction = this.wrapped.transaction(['activeChains'], 'readwrite');
        await wrappedTransaction.objectStore('activeChains').add({ chainStart, medallion });
        await wrappedTransaction.done;
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.initialized;
        const hasMap: ChainTracker = new ChainTracker({});
        (await this.getChainInfos()).map((value) => {
            hasMap.markIfNovel(value);
        });
        return hasMap;
    }

    async getSeenThrough(key: [Medallion, ChainStart]): Promise<SeenThrough> {
        await this.initialized;
        const commitInfo = await this.wrapped.transaction(['chainInfos']).objectStore('chainInfos').get(key);
        return commitInfo.timestamp;
    }

    private async getChainInfos(): Promise<Array<ChangeSetInfo>> {
        await this.initialized;
        return await this.wrapped.transaction(['chainInfos']).objectStore('chainInfos').getAll();
    }

    private static extractCommitInfo(changeSetData: Uint8Array | ChangeSetBuilder): ChangeSetInfo {
        if (changeSetData instanceof Uint8Array) {
            changeSetData = ChangeSetBuilder.deserializeBinary(changeSetData);
        }
        return {
            timestamp: changeSetData.getTimestamp(),
            medallion: changeSetData.getMedallion(),
            chainStart: changeSetData.getChainStart(),
            priorTime: changeSetData.getPreviousTimestamp() || undefined,
            comment: changeSetData.getComment() || undefined,
        }
    }

    async addChangeSet(changeSetBytes: ChangeSetBytes): Promise<ChangeSetInfo | undefined> {
        await this.initialized;
        const changeSetMessage = ChangeSetBuilder.deserializeBinary(changeSetBytes);
        const commitInfo = IndexedDbStore.extractCommitInfo(changeSetMessage);
        const { timestamp, medallion, chainStart, priorTime } = commitInfo
        const wrappedTransaction = this.wrapped.transaction(['trxns', 'chainInfos', 'containers', 'entries', 'exits'], 'readwrite');
        let oldChainInfo: ChangeSetInfo = await wrappedTransaction.objectStore("chainInfos").get([medallion, chainStart]);
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return;
            }
            if (oldChainInfo?.timestamp != priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close trxn?
                throw new Error(`missing prior chain entry for ${commitInfo}, have ${oldChainInfo}`);
            }
        }
        await wrappedTransaction.objectStore("chainInfos").put(commitInfo);
        // Only timestamp and medallion are required for uniqueness, the others just added to make
        // the getNeededTransactions faster by not requiring re-parsing.
        const commitKey: ChangeSetInfoTuple = IndexedDbStore.commitInfoToKey(commitInfo);
        await wrappedTransaction.objectStore("trxns").add(changeSetBytes, commitKey);
        const changesMap: Map<Offset, ChangeBuilder> = changeSetMessage.getChangesMap();
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
                    containerId[0] = srcMuid.getTimestamp() || commitInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || commitInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }
                const semanticKey = entryBuilder.hasKey() ? [unwrapKey(entryBuilder.getKey())] : [];
                const entryType: EntryType = entryBuilder.hasKey() ? EntryType.KEYED : 
                    (entryBuilder.hasBoxed() ? EntryType.BOXED: EntryType.QUEUE);
                const entryId: MuidTuple = [timestamp, medallion, offset];
                const pointeeList = [];
                if (entryBuilder.hasPointee()) {
                    const pointeeMuidBuilder: MuidBuilder = entryBuilder.getPointee();
                    const pointee = [
                        pointeeMuidBuilder.getTimestamp() || commitInfo.timestamp,
                        pointeeMuidBuilder.getMedallion() || commitInfo.medallion,
                        pointeeMuidBuilder.getOffset(),
                    ];
                    pointeeList.push(pointee);
                }
                const immediate = entryBuilder.hasImmediate() ? unwrapValue(entryBuilder.getImmediate()) : undefined;
                const expiry = entryBuilder.getExpiry() || undefined;
                const deleting = entryBuilder.hasDeleting() ? entryBuilder.getDeleting() : undefined;
                const entry: Entry = {
                    entryType,
                    containerId,
                    semanticKey,
                    entryId,
                    pointeeList,
                    immediate,
                    expiry,
                    deleting,
                }
                //TODO: add code to add expiries to existing directory entries on insert
                //console.log(JSON.stringify(entry));
                await wrappedTransaction.objectStore("entries").add(entry);
                continue;
            }
            if (changeBuilder.hasExit()) {
                //TODO(https://github.com/google/gink/issues/57): When not keeping history, apply exits then discard.
                const exitBuilder: ExitBuilder = changeBuilder.getExit();
                const entryMuid = exitBuilder.getEntry();
                const entryId: number[] = [
                    entryMuid.getTimestamp() || timestamp,
                    entryMuid.getMedallion() || medallion,
                    entryMuid.getOffset()];
                const exitId: number[] = [timestamp, medallion, offset];
                const expiry = exitBuilder.getExpiry() || undefined;
                const containerId: number[] = [0, 0, 0];
                if (exitBuilder.hasContainer()) {
                    const srcMuid: MuidBuilder = exitBuilder.getContainer();
                    containerId[0] = srcMuid.getTimestamp() || commitInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || commitInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }
                const exit = {
                    exitId,
                    entryId,
                    containerId,
                    expiry,
                    empty: [],
                    entryType: EntryType.QUEUE,
                };
                //TODO: add code to actually delete entries when not keeping full history
                await wrappedTransaction.objectStore("exits").add(exit);
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        await wrappedTransaction.done;
        return commitInfo;
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple = [address.timestamp, address.medallion, address.offset];
        const result = await this.wrapped.transaction(['containers']).objectStore('containers').get(addressTuple);
        return result;
    }

    async getEntry(container?: Muid, key?: KeyType | Muid, asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const semanticKey = (typeof (key) == "number" || typeof (key) == "string") ? [key] : [];
        const entryType = key === undefined ? EntryType.BOXED : (typeof(key) == "object" ? EntryType.QUEUE : EntryType.KEYED);
        const lower = [desiredSrc, entryType, semanticKey];
        const upperTuple = (key && typeof (key) == "object") ? [key.timestamp, key.medallion, key.offset] : [asOfTs];
        const upper = [desiredSrc, entryType, semanticKey, upperTuple];
        const searchRange = IDBKeyRange.bound(lower, upper);
        let cursor = await this.wrapped.transaction(["entries"]).objectStore("entries").openCursor(searchRange, "prev");
        if (cursor) {
            return cursor.value;
        }
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const lower = [desiredSrc, EntryType.KEYED];
        const searchRange = IDBKeyRange.lowerBound(lower);
        let cursor = await this.wrapped.transaction(["entries"]).objectStore("entries").openCursor(searchRange, "next");
        const result = new Map();
        for (; cursor && matches(cursor.key[0], desiredSrc); cursor = await cursor.continue()) {
            const entry = <Entry>cursor.value;
            ensure(entry.entryType == EntryType.KEYED && entry.semanticKey.length > 0);
            if (entry.entryId[0] < asOfTs) {
                if (entry.deleting) {
                    result.delete(entry.semanticKey[0]);
                } else {
                    result.set(entry.semanticKey[0], entry);
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
    async getOrderedEntries(container: Muid, through: number = Infinity, asOf?: AsOf): Promise<Entry[]> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const after = 0;
        const containerId = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const lower = [containerId, EntryType.QUEUE, [], [after]];
        const upper = [containerId, EntryType.QUEUE, [], [asOfTs]];
        const range = IDBKeyRange.bound(lower, upper);
        const trxn = this.wrapped.transaction(["entries", "exits"]);
        const entries = trxn.objectStore("entries");
        const exits = trxn.objectStore("exits");
        const returning = [];
        let entriesCursor = await entries.openCursor(range, through < 0 ? "prev" : "next");
        let exitsCursor = await exits.openCursor(range, through < 0 ? "prev" : "next");
        const needed = through < 0 ? -through : through + 1;
        while (entriesCursor && returning.length < needed) {
            //TODO(https://github.com/google/gink/issues/58): Handle multi-exit
            const exitKey: any[] = <any[]>exitsCursor?.key;
            if (exitsCursor && (globalThis.indexedDB.cmp(entriesCursor.key, exitKey.slice(0, 4)) == 0)) {
                // This entry has been removed and needs to be skipped.
                entriesCursor = await entriesCursor.continue();
                exitsCursor = await exitsCursor.continue();
                continue;
            }
            returning.push(entriesCursor.value);
            entriesCursor = await entriesCursor.continue();
        }
        return returning;
    }

    private static commitKeyToInfo(commitKey: ChangeSetInfoTuple) {
        return {
            timestamp: commitKey[0],
            medallion: commitKey[1],
            chainStart: commitKey[2],
            priorTime: commitKey[3],
            comment: commitKey[4],
        }
    }

    private static commitInfoToKey(commitInfo: ChangeSetInfo): ChangeSetInfoTuple {
        return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
        commitInfo.priorTime || 0, commitInfo.comment || ""];
    }

    async getAllEntryKeys() {
        return await this.wrapped.transaction(["entries"]).objectStore("entries").getAllKeys();
    }

    async getAllEntries() {
        return await this.wrapped.transaction(["entries"]).objectStore("entries").getAll();
    }

    async getAllExits() {
        return await this.wrapped.transaction(["exits"]).objectStore("exits").getAll();
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current commit, so its best if `callBack` doesn't await.
    async getCommits(callBack: (commitBytes: ChangeSetBytes, commitInfo: ChangeSetInfo) => void) {
        await this.initialized;

        // We loop through all commits and send those the peer doesn't have.
        for (let cursor = await this.wrapped.transaction("trxns").objectStore("trxns").openCursor();
            cursor; cursor = await cursor.continue()) {
            const commitKey = <ChangeSetInfoTuple>cursor.key;
            const commitInfo = IndexedDbStore.commitKeyToInfo(commitKey);
            const commitBytes: ChangeSetBytes = cursor.value;
            callBack(commitBytes, commitInfo);
        }
    }
}
