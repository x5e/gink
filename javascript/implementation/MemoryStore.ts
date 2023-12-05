import {
    builderToMuid,
    ensure,
    generateTimestamp, dehydrate,
    matches,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    muidTupleToString,
    sameData,
    unwrapKey,
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
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, BundleBuilder, ChangeBuilder, EntryBuilder, MovementBuilder, MuidBuilder, } from "./builders";
import { Container } from './Container';
import { TreeMap } from 'jstreemap';

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
    private entries: TreeMap<string, Entry>; // PlacementId => Entry

    constructor(private keepingHistory = true) {
        this.ready = this.initialize();
    }

    async dropHistory(container?: Muid, before?: AsOf): Promise<void> {
        const beforeTs = before ? await this.asOfToTimestamp(before) : await this.asOfToTimestamp(-1);
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
        return Promise.resolve();
    }

    async stopHistory(): Promise<void> {
        this.keepingHistory = false;
        return this.dropHistory();
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
        this.entries = new TreeMap();
        return Promise.resolve();
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        const backRefs: Entry[] = [];
        for (const [muidTupleString, entry] of this.entries.entries()) {
            if (muidTupleString == muidToString(pointingTo) && entry.pointeeList) {
                backRefs.push(entry);
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
        const hasMap: ChainTracker = new ChainTracker({});
        for (const bundleInfo of this.chainInfos.values()) {
            hasMap.markAsHaving(bundleInfo);
        }
        return Promise.resolve(hasMap);
    }

    async getSeenThrough(key: [Medallion, ChainStart]): Promise<SeenThrough> {
        return Promise.resolve(this.chainInfos.get(MemoryStore.medallionChainStartToString(key)).timestamp);
    }

    static medallionChainStartToString(tuple: [number, number]): string {
        // this is for [Medallion, ChainStart] keys
        return `${tuple[0]}, ${tuple[1]}`;
    }

    private getChainInfos(): Iterable<BundleInfo> {
        return this.chainInfos.values();
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
        const bundleInfo = MemoryStore.extractCommitInfo(bundleBuilder);
        const { timestamp, medallion, chainStart, priorTime } = bundleInfo;
        const oldChainInfo = this.chainInfos.get(MemoryStore.medallionChainStartToString([medallion, chainStart]));
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return [bundleInfo, false];
            }
            if (oldChainInfo?.timestamp != priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close?
                throw new Error(`missing prior chain entry for ${bundleInfo}, have ${oldChainInfo}`);
            }
        }
        this.chainInfos.set(MemoryStore.medallionChainStartToString([medallion, chainStart]), bundleInfo);
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
                // TODO(https://github.com/google/gink/issues/55): explain root
                const containerId: MuidTuple = [0, 0, 0];
                if (entryBuilder.hasContainer()) {
                    const srcMuid: MuidBuilder = entryBuilder.getContainer();
                    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }
                const behavior: Behavior = entryBuilder.getBehavior();
                let effectiveKey: KeyType | Timestamp | MuidTuple | [Muid, Muid] | [];
                let replacing = true;
                if (behavior == Behavior.DIRECTORY || behavior == Behavior.KEY_SET) {
                    ensure(entryBuilder.hasKey());
                    effectiveKey = unwrapKey(entryBuilder.getKey());
                } else if (behavior == Behavior.SEQUENCE) {
                    effectiveKey = entryBuilder.getEffective() || timestamp;
                    replacing = false;
                } else if (behavior == Behavior.BOX || behavior == Behavior.VERTEX) {
                    effectiveKey = [];
                } else if (behavior == Behavior.PROPERTY) {
                    ensure(entryBuilder.hasDescribing());
                    const describing = builderToMuid(entryBuilder.getDescribing());
                    effectiveKey = muidToTuple(describing);
                } else if (behavior == Behavior.ROLE) {
                    ensure(entryBuilder.hasDescribing());
                    const describing = builderToMuid(entryBuilder.getDescribing());
                    effectiveKey = muidToTuple(describing);
                } else if (behavior == Behavior.VERB) {
                    ensure(entryBuilder.hasPair());
                    effectiveKey = entryBuilder.getEffective() || timestamp;
                } else if (behavior == Behavior.PAIR_SET || behavior == Behavior.PAIR_MAP) {
                    ensure(entryBuilder.hasPair());
                    const pair = entryBuilder.getPair();
                    const left = pair.getLeft();
                    const rite = pair.getRite();
                    // There's probably a better way of doing this
                    effectiveKey = `${muidToString(builderToMuid(left))}-${muidToString(builderToMuid(rite))}`;
                } else {
                    throw new Error(`unexpected behavior: ${behavior}`)
                }
                const entryId: MuidTuple = [timestamp, medallion, offset];
                const placementId: MuidTuple = entryId;
                const pointeeList = <Indexable[]>[];
                if (entryBuilder.hasPointee()) {
                    const pointeeMuidBuilder: MuidBuilder = entryBuilder.getPointee();
                    const pointee = dehydrate({
                        timestamp: pointeeMuidBuilder.getTimestamp() || bundleInfo.timestamp,
                        medallion: pointeeMuidBuilder.getMedallion() || bundleInfo.medallion,
                        offset: pointeeMuidBuilder.getOffset(),
                    });
                    pointeeList.push(pointee);
                }
                const sourceList = <Indexable[]>[];
                const targetList = <Indexable[]>[];
                if (entryBuilder.hasPair()) {
                    const pairBuilder = entryBuilder.getPair();
                    const source = dehydrate({
                        timestamp: pairBuilder.getLeft().getTimestamp() || bundleInfo.timestamp,
                        medallion: pairBuilder.getLeft().getMedallion() || bundleInfo.medallion,
                        offset: pairBuilder.getLeft().getOffset()
                    });
                    sourceList.push(source);
                    const target = dehydrate({
                        timestamp: pairBuilder.getRite().getTimestamp() || bundleInfo.timestamp,
                        medallion: pairBuilder.getRite().getMedallion() || bundleInfo.medallion,
                        offset: pairBuilder.getRite().getOffset()
                    });
                    targetList.push(target);
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
                    let search: Entry;
                    // May be a better way to do this.
                    for (const [muidTuple, entry] of this.entries) {
                        if (muidTupleToString(entry.containerId) == muidTupleToString(containerId)) {
                            if ((Array.isArray(effectiveKey) && Array.isArray(entry.effectiveKey)) &&
                                (effectiveKey.length == 3 && entry.effectiveKey.length == 3)) {
                                if (muidTupleToString(entry.effectiveKey) == muidTupleToString(effectiveKey)) {
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
                            }
                            this.removals.set(muidTupleToString(removal.removalId), removal);
                        } else {
                            this.entries.delete(muidTupleToString(placementId));
                        }
                    }
                }
                this.entries.set(muidTupleToString(placementId), entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                const movementBuilder: MovementBuilder = changeBuilder.getMovement();
                const entryMuid = movementBuilder.getEntry();
                const entryId: MuidTuple = [
                    entryMuid.getTimestamp() || timestamp,
                    entryMuid.getMedallion() || medallion,
                    entryMuid.getOffset()];
                const movementId: MuidTuple = [timestamp, medallion, offset];
                const containerId: MuidTuple = [0, 0, 0];
                if (movementBuilder.hasContainer()) {
                    const srcMuid: MuidBuilder = movementBuilder.getContainer();
                    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
                    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
                    containerId[2] = srcMuid.getOffset();
                }
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
                    }
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
                }
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(clearanceBuilder.getContainer(), { timestamp, medallion, offset });
                const containerMuidTuple: MuidTuple = [container.timestamp, container.medallion, container.offset];
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    const onePast: [number, number, number] = [container.timestamp, container.medallion, container.offset + 1];
                    const lowerEntries = this.entries.lowerBound(muidTupleToString(containerMuidTuple));
                    const upper = this.entries.upperBound(muidTupleToString(onePast));
                    while (!lowerEntries.equals(upper)) {
                        this.entries.delete(lowerEntries.key);
                        lowerEntries.next();
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    const lowerClearances = this.clearances.lowerBound(muidTupleToString(containerMuidTuple));
                    while (!lowerEntries.equals(upper)) {
                        this.entries.delete(lowerClearances.key);
                        lowerClearances.next();
                    }
                    // When doing a purging clear, remove all removals for the container.
                    const lowerRemovals = this.removals.lowerBound(muidTupleToString(containerMuidTuple));
                    while (!lowerEntries.equals(upper)) {
                        this.entries.delete(lowerRemovals.key);
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
        return [bundleInfo, true];
    }

    private static commitInfoToKey(commitInfo: BundleInfo): BundleInfoTuple {
        return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
        commitInfo.priorTime || 0, commitInfo.comment || ""];
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        const addressTuple: [number, number, number] = [address.timestamp, address.medallion, address.offset];
        return this.containers.get(muidTupleToString(addressTuple));
    }

    private async asOfToTimestamp(asOf: AsOf): Promise<Timestamp> {
        if (asOf instanceof Date) {
            return asOf.getTime() * 1000;
        }
        if (asOf > MemoryStore.YEAR_2020) {
            return asOf;
        }
        if (asOf < 0 && asOf > -1000) {
            // Interpret as number of commits in the past.
            try {
                const trxnKeyArray = Array.from(this.trxns.keys())
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
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];

        let clearanceTime: Timestamp = 0;
        const clearancesSearch = this.clearances.get(muidTupleToString(desiredSrc));
        if (clearancesSearch) {
            clearanceTime = clearancesSearch.clearanceId[0];
        }

        let semanticKey: KeyType | MuidTuple | [] = [];
        if (typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array) {
            semanticKey = key;
        } else if (Array.isArray(key)) {
            let riteMuid: Muid;
            let leftMuid: Muid;
            if ("address" in key[0]) { // Left is a container
                leftMuid = key[0].address;
            }
            if ("address" in key[1]) { // Right is a container
                riteMuid = key[1].address;
            }
            if (!("address" in key[0])) { // Left is a muid
                leftMuid = key[0];
            }
            if (!("address" in key[1])) { // Right is a Muid
                riteMuid = key[1];
            }
            semanticKey = `${muidToString(leftMuid)}-${muidToString(riteMuid)}`;
        } else if (key) {
            const muidKey = <Muid>key;
            semanticKey = muidTupleToString([muidKey.timestamp, muidKey.medallion, muidKey.offset]);
        }
        const lower = this.entries.lowerBound(muidTupleToString(desiredSrc));
        const upper = this.entries.upperBound(muidTupleToString([asOfTs, desiredSrc[1], desiredSrc[2]]));
        let entry: Entry | undefined = undefined;
        while (!lower.equals(upper)) {
            if (lower.value.effectiveKey == semanticKey && !(lower.value.placementId[0] < clearanceTime)) {
                entry = lower.value;
                break;
            }
            lower.next();
        }
        return entry;
    }

    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void) {
        for (const [key, val] of this.trxns) {
            const commitKey: BundleInfoTuple = key;
            const commitInfo = MemoryStore.commitKeyToInfo(commitKey);
            const commitBytes: BundleBytes = val;
            callBack(commitBytes, commitInfo);
        }
    }

    async getEntryById(entryMuid: Muid): Promise<Entry | undefined> {
        const entry = this.entries.get(muidToString(entryMuid));
        return entry;
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const asOfTs = asOf ? (await this.asOfToTimestamp(asOf)) : Infinity;
        const desiredSrc: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        let clearanceTime: Timestamp = 0;
        const upperClearance = this.clearances.upperBound(muidTupleToString([asOfTs, desiredSrc[1], desiredSrc[2]]));
        if (upperClearance.value) {
            clearanceTime = upperClearance.value.clearanceId[0];
        }
        const lower = this.entries.lowerBound(muidTupleToString([desiredSrc[1], desiredSrc[2], Behavior.DIRECTORY]));
        const result = new Map();
        while (lower.value) {
            const entry = <Entry>lower.value;

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
            lower.next()
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
        const asOfTs: Timestamp = asOf ? (await this.asOfToTimestamp(asOf)) : generateTimestamp() + 1;
        const containerId: [number, number, number] = [container?.timestamp ?? 0, container?.medallion ?? 0, container?.offset ?? 0];
        const lower = this.entries.lowerBound(muidTupleToString(containerId));
        const upper = this.entries.upperBound(muidTupleToString([asOfTs, containerId[1], containerId[2]]));

        let clearanceTime: Timestamp = 0;
        const upperClearance = this.clearances.upperBound(muidTupleToString([asOfTs, containerId[1], containerId[2]]));
        if (upperClearance.value) {
            clearanceTime = upperClearance.value.clearanceId[0];
        }
        const returning = <Entry[]>[];

        let to = through < 0 ? lower : upper;
        let from = through < 0 ? upper : lower;

        const needed = through < 0 ? -through : through + 1;
        while (!from.equals(to) && from.value && returning.length < needed) {
            const entry: Entry = from.value;
            if (entry.placementId[0] >= clearanceTime) {
                const upperRemoval = this.removals.upperBound(muidTupleToString([asOfTs, entry.placementId[1], entry.placementId[2]]))
                if (!upperRemoval.value) returning.push(entry);
            }
            through < 0 ? from.prev() : from.next();
        }
        return returning;
    }

    async getEntriesBySourceOrTarget(): Promise<Entry[]> {
        throw Error("not implemented");
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

    async close(): Promise<void> {
        delete this.trxns;
        delete this.chainInfos;
        delete this.activeChains;
        delete this.clearances;
        delete this.containers;
        delete this.removals;
        delete this.entries;
    }

    // for debugging, not part of the api/interface
    getAllEntryKeys(): IterableIterator<string> {
        return this.entries.keys();
    }

    // for debugging, not part of the api/interface
    getAllEntries(): TreeMap<string, Entry> {
        return this.entries;
    }

    // for debugging, not part of the api/interface
    getAllRemovals(): TreeMap<string, Removal> {
        return this.removals;
    }
}
