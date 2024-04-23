import {
    builderToMuid,
    ensure,
    generateTimestamp,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    muidTupleToString,
    unwrapValue,
    sameData,
    getActorId
} from "./utils";
import {
    AsOf,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChain,
    Clearance,
    Entry,
    Indexable,
    KeyType,
    Medallion,
    Muid,
    MuidTuple,
    Offset,
    Removal,
    Timestamp,
    ActorId,
    BroadcastFunc,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, BundleBuilder, ChangeBuilder, EntryBuilder } from "./builders";
import { Container } from './Container';
import { TreeMap, TreeSet, ReverseIterator } from 'jstreemap';
import {
    getEffectiveKey,
    extractMovementInfo,
    extractContainerMuid,
    buildPairLists,
    buildPointeeList,
    medallionChainStartToString,
    extractCommitInfo,
    buildChainTracker,
    keyToSemanticKey,
    commitKeyToInfo
} from "./store_utils";

export class MemoryStore implements Store {
    ready: Promise<void>;
    private static readonly YEAR_2020 = (new Date("2020-01-01")).getTime() * 1000;
    private foundBundleCallBacks: BroadcastFunc[] = [];
    // Awkward, but need to use strings to represent objects, since we won't always
    // have the original reference to use.
    private trxns: TreeMap<BundleInfoTuple, Uint8Array> = new TreeMap(); // BundleInfoTuple => bytes
    private chainInfos: TreeMap<string, BundleInfo> = new TreeMap(); // [Medallion, ChainStart] => BundleInfo
    private activeChains: ClaimedChain[] = [];
    private clearances: TreeMap<string, Clearance> = new TreeMap(); // ContainerId,ClearanceId => Clearance
    private containers: TreeMap<string, Uint8Array> = new TreeMap(); // ContainerId => bytes
    private removals: TreeMap<string, string> = new TreeMap(); // containerId,placementId,removalId
    private entries: TreeMap<string, Entry> = new TreeMap(); // PlacementId => Entry
    private placements: TreeMap<string, string> = new TreeMap(); // ContainerID,Key,PlacementId => PlacementId
    private identities: Map<string, string> = new Map(); // Medallion,chainStart => identity
    private locations: TreeMap<string,string> = new TreeMap();
    constructor(private keepingHistory = true) {
        this.ready = Promise.resolve();
    }

    dropHistory(container?: Muid, before?: AsOf): void {
        const beforeTs = before ? this.asOfToTimestamp(before) : this.asOfToTimestamp(-1);
        let lower = this.entries.lowerBound(muidTupleToString([0, 0, 0]));
        let upper = this.entries.upperBound(muidTupleToString([beforeTs, 0, 0]));
        if (container) {
            const containerTuple = muidToTuple(container);
            lower = this.entries.lowerBound(muidTupleToString(containerTuple));
            upper = this.entries.upperBound(muidTupleToString([beforeTs, container.medallion, container.offset]));
        }

        while (!lower.equals(upper)) {
            this.removeEntry(lower.key);
            lower.next();
        }
    }

    stopHistory(): void {
        this.keepingHistory = false;
        this.dropHistory();
    }

    startHistory(): void {
        this.keepingHistory = true;
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        const backRefs: Entry[] = [];
        for (const [muidTupleString, entry] of this.entries.entries()) {
            if (entry.pointeeList) {
                for (const pointee of entry.pointeeList) {
                    if (muidTupleToString(pointee) == muidToString(pointingTo)) {
                        backRefs.push(entry);
                        break;
                    }
                }

            }
        }
        return Promise.resolve(backRefs);
    }

    getClaimedChains(): Promise<Map<Medallion, ClaimedChain>> {
        const result = new Map();
        let lastTime = 0;
        this.activeChains.sort((a, b) => a.claimTime - b.claimTime);
        for (let chain of this.activeChains) {
            ensure(chain.claimTime > lastTime);
            lastTime = chain.claimTime;
            result.set(chain.medallion, chain);
        }
        return Promise.resolve(result);
    }

    private claimChain(medallion: Medallion, chainStart: ChainStart, actorId?: ActorId): Promise<ClaimedChain> {
        const claim = {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime: generateTimestamp()
        };
        this.activeChains.push(claim);
        return Promise.resolve(claim);
    }

    async getChainIdentity(chainInfo: [Medallion, ChainStart]): Promise<string> {
        return this.identities.get(`${chainInfo[0]},${chainInfo[1]}`);
    }

    async getChainTracker(): Promise<ChainTracker> {
        const chainInfos = this.getChainInfos();
        const chainTracker = buildChainTracker(chainInfos);
        return Promise.resolve(chainTracker);
    }

    private getChainInfos(): Iterable<BundleInfo> {
        return this.chainInfos.values();
    }

    async addBundle(bundleBytes: BundleBytes, claimChain?: boolean): Promise<BundleInfo> {
        await this.ready;
        const bundleBuilder = <BundleBuilder>BundleBuilder.deserializeBinary(bundleBytes);
        const bundleInfo = extractCommitInfo(bundleBuilder);
        const { timestamp, medallion, chainStart, priorTime } = bundleInfo;
        const oldChainInfo = this.chainInfos.get(medallionChainStartToString([medallion, chainStart]));
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return bundleInfo;
            }
            if (oldChainInfo?.timestamp != priorTime) {
                throw new Error(`missing prior chain entry for ${JSON.stringify(bundleInfo)}, ` +
                    `have ${JSON.stringify(oldChainInfo)}`);
            }
        }
        // If this is a new chain, save the identity & claim this chain
        if (claimChain) {
            ensure(bundleInfo.timestamp == bundleInfo.chainStart);
            const chainInfo: [Medallion, ChainStart] = [bundleInfo.medallion, bundleInfo.chainStart];
            this.identities.set(`${chainInfo[0]},${chainInfo[1]}`, bundleInfo.comment);

            this.claimChain(bundleInfo.medallion, bundleInfo.chainStart, getActorId());
        }

        this.chainInfos.set(medallionChainStartToString([medallion, chainStart]), bundleInfo);
        const commitKey: BundleInfoTuple = MemoryStore.commitInfoToKey(bundleInfo);
        this.trxns.set(commitKey, bundleBytes);
        const changesMap: Map<Offset, ChangeBuilder> = bundleBuilder.getChangesMap();
        for (const [offset, changeBuilder] of changesMap.entries()) {
            ensure(offset > 0);
            const changeAddressTuple: MuidTuple = [timestamp, medallion, offset];
            if (changeBuilder.hasContainer()) {
                const containerBytes = changeBuilder.getContainer().serializeBinary();
                this.containers.set(muidTupleToString(changeAddressTuple), containerBytes);
                continue;
            }
            if (changeBuilder.hasEntry()) {
                const entryBuilder: EntryBuilder = changeBuilder.getEntry();
                let containerId: [number, number, number] = [0, 0, 0];
                if (entryBuilder.hasContainer()) {
                    containerId = extractContainerMuid(entryBuilder, bundleInfo);
                }
                const behavior: Behavior = entryBuilder.getBehavior();
                const entryId: MuidTuple = [timestamp, medallion, offset];
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
                const [effectiveKey, replacing] = getEffectiveKey(entryBuilder, timestamp);
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
                    let search: Entry;
                    // TODO May be a better way to do this.
                    for (const entry of this.entries.values()) {
                        if (muidTupleToString(entry.containerId) == muidTupleToString(containerId)) {
                            if ((Array.isArray(effectiveKey) && Array.isArray(entry.effectiveKey)) &&
                                (effectiveKey.length == 3 && entry.effectiveKey.length == 3)) {
                                if (muidTupleToString(entry.effectiveKey) == muidTupleToString(effectiveKey)) {
                                    search = entry;
                                }
                            } else if (typeof effectiveKey == "object" && typeof entry.effectiveKey == "object") {
                                if (effectiveKey.toString() == entry.effectiveKey.toString()) {
                                    search = entry;
                                }
                            } else {
                                if (entry.effectiveKey == effectiveKey) {
                                    search = entry;
                                }
                            }
                        }
                    }
                    if (search) {
                        /*
                        if (this.keepingHistory) {
                            const removal: Removal = {
                                removing: search.placementId,
                                removalId: placementId,
                                containerId: containerId,
                                dest: 0,
                                entryId: search.entryId
                            };
                            this.removals.set(muidTupleToString(removal.removalId), removal);
                            this.removalsByPlacementId.set(muidTupleToString(placementId), removal);
                            const entryToMark = this.entries.get(muidTupleToString(search.entryId));
                            // TODO: fix this, entries should never be changed!
                            entryToMark.deletion = true;
                            this.addEntry(entryToMark);
                        } else {
                            this.removeEntry(muidTupleToString(placementId));
                        }
                        */
                    }
                }
                const entryIdStr = muidTupleToString(entry.entryId);
                this.entries.set(entryIdStr, entry);
                const placementKey = this.entryToPlacementKey(entry);
                this.placements.set(placementKey, entryIdStr);
                if (behavior == Behavior.SEQUENCE || behavior == Behavior.EDGE_TYPE) {
                    this.locations.set(
                        `${muidTupleToString(entryId)},${muidTupleToString(placementId)}`,
                        placementKey);
                }
                continue;
            }
            if (changeBuilder.hasMovement()) {
                const { movementBuilder, entryId, movementId, containerId } = extractMovementInfo(changeBuilder, bundleInfo, offset);
                const entryIdStr = muidTupleToString(entryId);
                const containerIdStr = muidTupleToString(containerId);
                const movementIdStr = muidTupleToString(movementId);
                const dest = movementBuilder.getDest();
                if (movementBuilder.getPurge() || !this.keepingHistory) {
                    const iterator = this.locations.lowerBound(entryIdStr);
                    while (true) {
                        if (iterator.equals(this.locations.end())) break;
                        if (!iterator.key.startsWith(entryIdStr)) break;
                        this.placements.delete(iterator.value);
                        this.locations.erase(iterator);
                        iterator.next();
                    }
                    if (!dest) {
                        this.entries.delete(entryIdStr);
                    }
                } else {
                    const iterator = this.locations.upperBound(entryIdStr + ',~');
                    iterator.prev();
                    if (iterator.key && iterator.key.startsWith(entryIdStr)) break;
                    // TODO: make sure that I'm looking up the removal appropriately
                    this.removals.set(`${iterator.value},${movementIdStr}`, "");
                }
                if (dest != 0) {
                    const placementKey = `${containerIdStr},${dest},${movementIdStr}`;
                    this.placements.set(placementKey,entryIdStr);
                    this.locations.set(`${entryIdStr},${movementIdStr}`, placementKey);
                }
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(clearanceBuilder.getContainer(), { timestamp, medallion, offset });
                const containerMuidTuple: MuidTuple = [container.timestamp, container.medallion, container.offset];
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    const lowerEntries = this.placements.lowerBound(muidTupleToString(containerMuidTuple));
                    const upperEntries = this.placements.upperBound(`${muidTupleToString(containerMuidTuple)},~,~`);
                    let prevKey = undefined;
                    let prevEntry = undefined;
                    for (const it = lowerEntries; it; it.next()) {
                        // Have to delete the previous key, because iteration will be broken if the
                        // current key is deleted.
                        if (prevKey) {
                            ensure(muidTupleToString(this.entries.get(prevEntry).containerId) == muidToString(container));
                            this.removeEntry(prevEntry);
                        }
                        if (it.equals(upperEntries)) break;
                        prevKey = it.key;
                        prevEntry = it.value;
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    const lowerClearances = this.clearances.lowerBound(`${muidTupleToString(containerMuidTuple)}`);
                    const upperClearances = this.clearances.upperBound(`${muidTupleToString(containerMuidTuple)},~`);
                    while (lowerClearances) {
                        if (lowerClearances.equals(upperClearances)) break;
                        if (muidTupleToString(lowerClearances.value.containerId) != muidTupleToString(containerMuidTuple)) break;
                        this.clearances.delete(lowerClearances.key);
                        lowerClearances.next();
                    }
                    // When doing a purging clear, remove all removals for the container.
                    // TODO: fix
                    throw new Error("not implemented");
                    /*
                    const lowerRemovals = this.removals.lowerBound(muidTupleToString(containerMuidTuple));
                    while (lowerRemovals) {
                        if (lowerRemovals.value &&
                            muidTupleToString(lowerRemovals.value.containerId) != muidTupleToString(containerMuidTuple)) break;
                        this.removals.delete(lowerRemovals.key);
                        if (lowerRemovals.equals(this.removals.end())) break;
                        lowerRemovals.next();
                    }
                    */
                }
                const clearance: Clearance = {
                    containerId: containerMuidTuple,
                    clearanceId: changeAddressTuple,
                    purging: clearanceBuilder.getPurge()
                };
                this.clearances.set(`${muidTupleToString(containerMuidTuple)},${muidTupleToString(clearance.clearanceId)}`, clearance);
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        return bundleInfo;
    }

    private static commitInfoToKey(commitInfo: BundleInfo): BundleInfoTuple {
        return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
        commitInfo.priorTime || 0, commitInfo.comment || ""];
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple: [number, number, number] = [address.timestamp, address.medallion, address.offset];
        return this.containers.get(muidTupleToString(addressTuple));
    }

    private asOfToTimestamp(asOf: AsOf): Timestamp {
        if (asOf instanceof Date) {
            return asOf.getTime() * 1000;
        }
        if (asOf > MemoryStore.YEAR_2020) {
            return asOf;
        }
        if (asOf < 0 && asOf > -1000) {
            // Interpret as number of commits in the past.
            try {
                const trxnKeyArray = Array.from(this.trxns.keys());
                const key = trxnKeyArray[trxnKeyArray.length + asOf];
                return key[0];
            } catch {
                // Looking further back than we have commits.
                throw new Error("no commits that far back");
            }
        }
        throw new Error(`don't know how to interpret asOf=${asOf}`);
    }

    getEntryByKey(container?: Muid, key?: KeyType | Muid | [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Entry | undefined> {
        try {
            return Promise.resolve(this.getEntryByKeyHelper(container, key, asOf));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    getEntryByKeyHelper(container?: Muid, key?: KeyType | Muid | [Muid | Container, Muid | Container], asOf?: AsOf): Entry | undefined {
        const asOfTs = asOf ? (this.asOfToTimestamp(asOf)) : generateTimestamp();
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const srcAsStr = muidTupleToString(desiredSrc);
        let clearanceTime: Timestamp = this.getLastClearanceTimeForContainer(srcAsStr, asOfTs);
        const semanticKey = keyToSemanticKey(key);
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const prefix = `${srcAsStr},${semanticKey}`;
        const upperBound = `${prefix},${asOfTsStr}`;
        const forwardIterator = this.placements.upperBound(upperBound);
        const reverseIterator = new ReverseIterator<string,string>(forwardIterator);
        // TreeMap upperBound always fetches the entry GREATER than the provided key.
        // After reversing, need to go to the next element (i.e. one before the bound)
        //reverseIterator.next();
        if (reverseIterator.equals(this.placements.rend())) {
            // this means nothing existed before upperBound
            return undefined;
        }
        if (!reverseIterator.key.startsWith(prefix)) {
            // this means the last key before upperBound was for a different container
            return undefined;
        }
        const entry: Entry = this.entries.get(reverseIterator.value);
        if (!entry) throw new Error(`missing entry for: ${reverseIterator.value}`);
        if (entry.placementId[0] < clearanceTime) {
            // container was cleared after this entry
            return undefined;
        }
        if (entry.deletion) {
            // entry is serves as a deletion
            return undefined;
        }
        return entry;
    }

    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void) {
        for (const [key, val] of this.trxns) {
            const commitKey: BundleInfoTuple = key;
            const commitInfo = commitKeyToInfo(commitKey);
            const commitBytes: BundleBytes = val;
            callBack(commitBytes, commitInfo);
        }
    }

    async getEntryById(entryMuid: Muid): Promise<Entry | undefined> {
        const entry = this.entries.get(muidToString(entryMuid));
        return entry;
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const asOfTs = asOf ? (this.asOfToTimestamp(asOf)) : generateTimestamp();
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const srcAsStr = muidTupleToString(desiredSrc);
        let clearanceTime: Timestamp = this.getLastClearanceTimeForContainer(srcAsStr, asOfTs);
        const lower = this.placements.lowerBound(srcAsStr);

        const result = new Map();
        while (lower) {
            if (lower.key) {
                // Break if we enter the entries for another container
                if (lower.key.split(",")[0] != srcAsStr) break;
            }
            const entryKey: string = lower.value;
            if (entryKey) {
                const entry = this.entries.get(entryKey);
                ensure(entry.behavior == Behavior.DIRECTORY || entry.behavior == Behavior.KEY_SET || entry.behavior == Behavior.ROLE ||
                    entry.behavior == Behavior.PAIR_SET || entry.behavior == Behavior.PAIR_MAP || entry.behavior == Behavior.PROPERTY);

                let key: Muid | string | number | Uint8Array | [];
                if (typeof (entry.effectiveKey) == "string" || entry.effectiveKey instanceof Uint8Array || typeof (entry.effectiveKey) == "number") {
                    key = entry.effectiveKey;
                } else if (Array.isArray(entry.effectiveKey) && entry.effectiveKey.length == 3) {
                    // If the key is a MuidTuple
                    key = muidToString(muidTupleToMuid(entry.effectiveKey));
                } else {
                    throw Error(`not sure what to do with a ${typeof (entry.effectiveKey)} key`);
                }
                ensure((typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array || typeof (key) == "object"));
                // If asOf is after the clearance, then the entries need to be between the last clearance and the asOf timestamp.
                // Otherwise, the entries just need to be before the asOf timestamp.
                const afterClearance = asOfTs > clearanceTime ?
                    (entry.entryId[0] >= clearanceTime && entry.entryId[0] < asOfTs) : entry.entryId[0] < asOfTs;

                if (afterClearance && muidTupleToString(entry.containerId) == muidToString(container) && !entry.deletion) {
                    result.set(key, entry);
                }
            }
            if (lower.equals(this.placements.end())) break;
            lower.next();
        }
        return result;
    };

    /**
     * Returns entry data for a List.
     * @param container to get entries for
     * @param through number to get, negative for starting from end
     * @param asOf show results as of a time in the past
     * @returns a promise of a list of ChangePairs
     */
    async getOrderedEntries(container: Muid, through = Infinity, asOf?: AsOf): Promise<Entry[]> {
        const asOfTs: Timestamp = asOf ? (this.asOfToTimestamp(asOf)) : generateTimestamp();
        const containerId: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const containerIdStr = muidTupleToString(containerId);
        const lower = this.placements.lowerBound(containerIdStr);
        // TODO: switch sequence key to be appropriately padded/encoded
        const upper = this.placements.upperBound(`${containerIdStr},${asOfTs}`);

        let clearanceTime: Timestamp = this.getLastClearanceTimeForContainer(containerIdStr, asOfTs);
        const returning = <Entry[]>[];

        // If we need to iterate forward or backward
        let to = through < 0 ? lower : upper;
        let from = through < 0 ? upper : lower;

        const needed = through < 0 ? -through : through + 1;
        while (returning.length < needed) {
            const placementKey = from.key;
            // '0616C86BB4D7B4-1A86FC813F72F-00001,1713899916549000,0616C86BB4DB88-1A86FC813F72F-00001'
            const placementId = placementKey.substr(-34,);
            console.log(placementKey);
            const entryKey: string = from.value;
            if (entryKey) {
                const entry = this.entries.get(entryKey);
                const afterClearance = asOfTs > clearanceTime ?
                    (entry.entryId[0] >= clearanceTime && entry.entryId[0] < asOfTs) : entry.entryId[0] < asOfTs;

                if (afterClearance && containerIdStr == muidTupleToString(entry.containerId)) {
                    throw new Error("not implemented");  // TODO
                    //const removal = this.removalsByPlacementId.get(muidTupleToString(entry.placementId));
                    //if (!removal || removal.removalId[0] > asOfTs) returning.push(entry);
                }
            }
            if (from.equals(to)) break;
            through < 0 ? from.prev() : from.next();
        }
        return returning;
    }

    entryToPlacementKey(entry: Entry): string {
        const containerIdStr = muidTupleToString(entry.containerId);
        const placementIdStr = muidTupleToString(entry.placementId);
        const placementKey = `${containerIdStr},${entry.effectiveKey},${placementIdStr}`;
        return placementKey;
    }

    /**
     * Helper to remove entries from all maps/indexes.
     */
    removeEntry(entryId: string) {
        const entry = this.entries.get(entryId);
        ensure(entry, "entry not found - something is broken");
        this.entries.delete(entryId);
        const indexedKey = `${muidTupleToString(entry.containerId)},${entry.effectiveKey},${muidTupleToString(entry.placementId)}`;
        this.placements.delete(indexedKey);
    }

    /**
     * Returns the timestamp of the last clearance for any given container.
     * @param containerId container muid as a string
     * @param asOf optional timestamp to query - finds the last clearance within the timeframe.
     * @returns the timestamp of the last clearance, or 0 if one wasn't found.
     */
    getLastClearanceTimeForContainer(containerId: string, asOf?: Timestamp): number {
        const asOfStr = asOf ? muidTupleToString([asOf, 0, 0]) : '~';
        const upperClearance = this.clearances.upperBound(`${containerId},${asOfStr}`);
        upperClearance.prev();
        let clearanceTime: number = 0;
        if (upperClearance.value && sameData(containerId, muidTupleToString(upperClearance.value.containerId))) {
            clearanceTime = upperClearance.value.clearanceId[0];
        }
        return clearanceTime;
    }

    async getEntriesBySourceOrTarget(): Promise<Entry[]> {
        throw new Error("not implemented");
    }

    async close(): Promise<void> {
        await this.ready;
        delete this.trxns;
        delete this.chainInfos;
        delete this.activeChains;
        delete this.clearances;
        delete this.containers;
        delete this.removals;
        delete this.entries;
        delete this.placements;
        return Promise.resolve();
    };

    // for debugging, not part of the api/interface
    getAllEntryKeys(): Array<string> {
        return Array.from(this.entries.keys());
    };

    // for debugging, not part of the api/interface
    getAllEntries(): Array<Entry> {
        return Array.from(this.entries.values());
    };

    // for debugging, not part of the api/interface
    getAllRemovals(): TreeMap<string, string> {
        return this.removals;
    }

    addFoundBundleCallBack(callback: BroadcastFunc): void {
        this.foundBundleCallBacks.push(callback);
    }
}
