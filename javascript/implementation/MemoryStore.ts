import {
    builderToMuid,
    ensure,
    generateTimestamp,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    muidTupleToString,
    unwrapValue
} from "./utils";
import {
    AsOf,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChains,
    Clearance,
    Entry,
    Indexable,
    KeyType,
    Medallion,
    Muid,
    MuidTuple,
    Offset,
    Removal,
    SeenThrough,
    Timestamp,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, BundleBuilder, ChangeBuilder, EntryBuilder } from "./builders";
import { Container } from './Container';
import { TreeMap } from 'jstreemap';
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
    // Awkward, but need to use strings to represent objects, since we won't always
    // have the original reference to use.
    private trxns: TreeMap<BundleInfoTuple, Uint8Array>; // BundleInfoTuple => bytes
    private chainInfos: TreeMap<string, BundleInfo>; // [Medallion, ChainStart] => BundleInfo
    private activeChains: Map<Medallion, ChainStart>;
    private clearances: TreeMap<string, Clearance>; // ClearanceId => Clearance
    private containers: TreeMap<string, Uint8Array>; // ContainerId => bytes
    private removals: TreeMap<string, Removal>; // RemovalId => Removal
    private removalsByPlacementId: Map<string, Removal>; // EntryId => Removal
    private entries: TreeMap<string, Entry>; // PlacementId => Entry

    constructor(private keepingHistory = true) {
        this.ready = this.initialize();
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
            this.entries.delete(lower.key);
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

    private async initialize(): Promise<void> {
        this.trxns = new TreeMap();
        this.chainInfos = new TreeMap();
        this.activeChains = new Map();
        this.clearances = new TreeMap();
        this.containers = new TreeMap();
        this.removals = new TreeMap();
        this.removalsByPlacementId = new Map();
        this.entries = new TreeMap();
        return Promise.resolve();
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

    async getClaimedChains(): Promise<ClaimedChains> {
        return Promise.resolve(this.activeChains);
    }

    async claimChain(medallion: Medallion, chainStart: ChainStart): Promise<void> {
        this.activeChains.set(medallion, chainStart);
        return Promise.resolve();
    }

    async getChainTracker(): Promise<ChainTracker> {
        const chainInfos = this.getChainInfos();
        const chainTracker = buildChainTracker(chainInfos);
        return Promise.resolve(chainTracker);
    }

    private getChainInfos(): Iterable<BundleInfo> {
        return this.chainInfos.values();
    }

    async addBundle(bundleBytes: BundleBytes): Promise<BundleInfo> {
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
                throw new Error(`missing prior chain entry for ${bundleInfo}, have ${oldChainInfo}`);
            }
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
                    // May be a better way to do this.
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
                            entryToMark.deletion = true;
                            this.entries.set(muidTupleToString(placementId), entryToMark);
                        } else {
                            this.entries.delete(muidTupleToString(placementId));
                        }
                    }
                }
                this.entries.set(muidTupleToString(placementId), entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                const { movementBuilder, entryId, movementId, containerId } = extractMovementInfo(changeBuilder, bundleInfo, offset);
                const found: Entry = this.entries.get(muidTupleToString(entryId));
                if (!found) {
                    continue; // Nothing found to remove.
                }
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
                    };
                    this.entries.set(muidTupleToString(destEntry.placementId), destEntry);
                }
                if (movementBuilder.getPurge() || !this.keepingHistory) {
                    this.entries.delete(muidTupleToString(entryId));
                } else {
                    const removal: Removal = {
                        containerId,
                        removalId: movementId,
                        dest,
                        entryId,
                        removing: found.placementId,
                    };
                    this.removals.set(muidTupleToString(removal.removalId), removal);
                    this.removalsByPlacementId.set(muidTupleToString(found.placementId), removal);
                }
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(clearanceBuilder.getContainer(), { timestamp, medallion, offset });
                const containerMuidTuple: MuidTuple = [container.timestamp, container.medallion, container.offset];
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    const lowerEntries = this.entries.lowerBound(muidTupleToString(containerMuidTuple));
                    let prevKey = undefined;
                    let prevEntry = undefined;
                    for (const it = lowerEntries; it; it.next()) {
                        // Have to delete the previous key, because iteration will be broken if the
                        // current key is deleted.
                        if (prevKey && muidTupleToString(prevEntry.containerId) == muidToString(container)) {
                            this.entries.delete(prevKey);
                        }
                        if (it.equals(this.entries.end())) break;
                        prevKey = it.key;
                        prevEntry = it.value;
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    const lowerClearances = this.clearances.lowerBound(muidTupleToString(containerMuidTuple));
                    while (lowerClearances) {
                        this.clearances.delete(lowerClearances.key);
                        if (lowerClearances.equals(this.clearances.end())) break;
                        lowerClearances.next();
                    }
                    // When doing a purging clear, remove all removals for the container.
                    const lowerRemovals = this.removals.lowerBound(muidTupleToString(containerMuidTuple));
                    while (lowerRemovals) {
                        this.removals.delete(lowerRemovals.key);
                        if (lowerRemovals.equals(this.removals.end())) break;
                        lowerRemovals.next();
                    }
                }
                const clearance: Clearance = {
                    containerId: containerMuidTuple,
                    clearanceId: changeAddressTuple,
                    purging: clearanceBuilder.getPurge()
                };
                this.clearances.set(muidTupleToString(clearance.clearanceId), clearance);
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

    async getEntryByKey(container?: Muid, key?: KeyType | Muid | [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Entry | undefined> {
        const asOfTs = asOf ? (this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        let clearanceTime: Timestamp = 0;
        const clearancesSearch = this.clearances.last();
        if (clearancesSearch) {
            clearanceTime = clearancesSearch[1].clearanceId[0];
        }

        const semanticKey = keyToSemanticKey(key);
        const lower = this.entries.lowerBound(muidTupleToString(desiredSrc));
        const upper = this.entries.upperBound(muidTupleToString([asOfTs, desiredSrc[1], desiredSrc[2]]));
        const asOfBeforeClear = asOfTs <= clearanceTime;
        let entry: Entry | undefined = undefined;
        while (!lower.equals(upper)) {
            if (lower.value && lower.value.effectiveKey.toString() == semanticKey.toString() && !lower.value.deletion &&
                lower.value.entryId[0] < asOfTs) {
                const entryAfterClearance = lower.value.entryId[0] >= clearanceTime;
                if (asOfBeforeClear ? true : entryAfterClearance) {
                    entry = lower.value;
                    break;
                }
            }
            lower.next();
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
        const asOfTs = asOf ? (this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        let clearanceTime: Timestamp = 0;
        const upperClearance = this.clearances.last();
        if (upperClearance) {
            clearanceTime = upperClearance[1].clearanceId[0];
        }
        const lower = this.entries.lowerBound(muidTupleToString([Math.abs(desiredSrc[0]), Math.abs(desiredSrc[1]), Behavior.DIRECTORY]));
        const upper = this.entries.upperBound(muidTupleToString([asOfTs, Math.abs(desiredSrc[1]), Behavior.DIRECTORY]));
        const result = new Map();
        while (lower) {
            const entry = <Entry>lower.value;
            if (entry) {
                if (entry.behavior == Behavior.DIRECTORY || entry.behavior == Behavior.KEY_SET || entry.behavior == Behavior.ROLE ||
                    entry.behavior == Behavior.PAIR_SET || entry.behavior == Behavior.PAIR_MAP) {
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
                    const asOfBeforeClear = asOfTs <= clearanceTime;
                    const entryAfterClearance = entry.entryId[0] >= clearanceTime;
                    // If asOf timestamp is before or at the last clearance, we can ignore the clearance
                    // time, and just look for entries up to the asOf timestamp.
                    // Otherwise, we need to find entries between clearance and asOf.
                    if (entry.entryId[0] < asOfTs && (asOfBeforeClear ? true : entryAfterClearance) &&
                        muidTupleToString(entry.containerId) == muidToString(container)) {
                        if (entry.deletion) {
                            result.delete(key);
                        } else {
                            result.set(key, entry);
                        }
                    }
                }
            }
            if (lower.equals(upper)) break;
            lower.next();
        }
        return result;
    }

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
        const lower = this.entries.lowerBound(muidTupleToString(containerId));
        const upper = this.entries.upperBound(muidTupleToString([asOfTs, containerId[1], containerId[2]]));
        let clearanceTime: Timestamp = 0;
        const upperClearance = this.clearances.last();
        if (upperClearance) {
            clearanceTime = upperClearance[1].clearanceId[0];
        }
        const returning = <Entry[]>[];

        let to = through < 0 ? lower : upper;
        let from = through < 0 ? upper : lower;

        const needed = through < 0 ? -through : through + 1;
        const asOfBeforeClear = asOfTs <= clearanceTime;
        while (returning.length < needed) {
            const entry: Entry = from.value;
            // Specifically checking whether timestamp is before asOf, because treemap always finds
            // the entry GREATER than upper bound.
            if (entry) {
                const entryAfterClearance = entry.entryId[0] >= clearanceTime;
                if (entry.entryId[0] < asOfTs && (asOfBeforeClear ? true : entryAfterClearance) &&
                    muidToString(container) == muidTupleToString(entry.containerId)) {
                    const removal = this.removalsByPlacementId.get(muidTupleToString(entry.placementId));
                    if (!removal || removal.removalId[0] > asOfTs) returning.push(entry);
                }
            }
            if (from.equals(to)) break;
            through < 0 ? from.prev() : from.next();
        }
        return returning;
    }

    async getEntriesBySourceOrTarget(): Promise<Entry[]> {
        throw Error("not implemented");
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
        return Promise.resolve();
    }

    // for debugging, not part of the api/interface
    getAllEntryKeys(): Array<string> {
        return Array.from(this.entries.keys());
    }

    // for debugging, not part of the api/interface
    getAllEntries(): Array<Entry> {
        return Array.from(this.entries.values());
    }

    // for debugging, not part of the api/interface
    getAllRemovals(): TreeMap<string, Removal> {
        return this.removals;
    }
}
