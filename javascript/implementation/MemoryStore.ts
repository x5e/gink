import {
    builderToMuid,
    ensure,
    generateTimestamp, dehydrate,
    matches,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
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

export class MemoryStore implements Store {
    ready: Promise<void>;
    private trxns: Map<Uint8Array, BundleInfoTuple>; // may want to specify value eventually
    private chainInfos: Map<[Medallion, ChainStart], BundleInfo>;
    private activeChains: Map<[Medallion, ChainStart], boolean>;
    private clearances: Map<MuidTuple, Clearance>;
    private containers: Map<Uint8Array, MuidTuple>;
    private removals: Map<MuidTuple, Removal>;
    private entries: Map<MuidTuple, Entry>;

    constructor(private keepingHistory = true) {
        this.ready = this.initialize();
    }

    private async initialize(): Promise<void> {
        this.trxns = new Map();
        this.chainInfos = new Map();
        this.activeChains = new Map();
        this.clearances = new Map();
        this.containers = new Map();
        this.removals = new Map();
        this.entries = new Map();
        return Promise.resolve();
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        const backRefs: Entry[] = [];
        for (const [muidTuple, entry] of this.entries.entries()) {
            if (muidTuple == muidToTuple(pointingTo) && entry.pointeeList) {
                backRefs.push(entry);
            }
        }
        return new Promise(() => backRefs);
    }

    async getClaimedChains(): Promise<ClaimedChains> {
        const result = new Map();
        for (const [medallion, chainStart] of this.activeChains) {
            result.set(medallion, chainStart);
        }
        return new Promise(() => result);
    }

    async claimChain(medallion: Medallion, chainStart: ChainStart): Promise<void> {
        this.activeChains.set([medallion, chainStart], true);
        return Promise.resolve();
    }

    async getChainTracker(): Promise<ChainTracker> {
        const hasMap: ChainTracker = new ChainTracker({});
        for (const bundleInfo of this.chainInfos.values()) {
            hasMap.markAsHaving(bundleInfo);
        }
        return new Promise(() => hasMap);
    }

    async getSeenThrough(key: [Medallion, ChainStart]): Promise<SeenThrough> {
        return new Promise(() => this.chainInfos.get(key).timestamp);
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
        const oldChainInfo = this.chainInfos.get([medallion, chainStart]);
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return [bundleInfo, false];
            }
            if (oldChainInfo?.timestamp != priorTime) {
                //TODO(https://github.com/google/gink/issues/27): Need to explicitly close?
                throw new Error(`missing prior chain entry for ${bundleInfo}, have ${oldChainInfo}`);
            }
        }
        this.chainInfos.set([medallion, chainStart], bundleInfo);
        const commitKey: BundleInfoTuple = MemoryStore.commitInfoToKey(bundleInfo);
        this.trxns.set(bundleBytes, commitKey);
        const changesMap: Map<Offset, ChangeBuilder> = bundleBuilder.getChangesMap();
        for (const [offset, changeBuilder] of changesMap.entries()) {
            ensure(offset > 0);
            const changeAddressTuple: MuidTuple = [timestamp, medallion, offset];
            if (changeBuilder.hasContainer()) {
                const containerBytes = changeBuilder.getContainer().serializeBinary();
                this.containers.set(containerBytes, changeAddressTuple);
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
                        if (entry.containerId == containerId && entry.effectiveKey == effectiveKey) {
                            search = entry;
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
                            this.removals.set(removal.removalId, removal);
                        } else {
                            this.entries.delete(placementId);
                        }
                    }
                }
                this.entries.set(placementId, entry);
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
                    this.entries.set(destEntry.placementId, destEntry);
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
                    this.removals.set(removal.removalId, removal);
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
                this.clearances.set(clearance.clearanceId, clearance);
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
}
