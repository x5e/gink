import {
    builderToMuid,
    ensure,
    generateTimestamp,
    muidToString,
    muidTupleToString,
    unwrapValue,
    sameData,
    getActorId,
    toLastWithPrefixBeforeSuffix,
    strToMuid,
    bytesToHex,
    verifyBundle,
    librariesReady,
    emptyBytes,
    strToMuidTuple,
    shorterHash,
    decryptMessage,
    dumpTree,
} from "./utils";
import {
    AsOf,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChain,
    Clearance,
    Entry,
    Indexable,
    ScalarKey,
    Medallion,
    Muid,
    MuidTuple,
    Timestamp,
    ActorId,
    BroadcastFunc,
    Movement,
    BundleView,
    KeyPair,
    Value,
    Placement,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import {
    Behavior,
    BundleBuilder,
    ChangeBuilder,
    EntryBuilder,
} from "./builders";
import { MapIterator, TreeMap } from "jstreemap";
import {
    getStorageKey as getStorageKey,
    extractMovement,
    extractContainerMuid,
    buildPairLists,
    buildPointeeList,
    medallionChainStartToString,
    buildChainTracker,
    toStorageKey,
    storageKeyToString,
} from "./store_utils";
import { Decomposition } from "./Decomposition";

export class MemoryStore implements Store {
    ready: Promise<void>;
    private static readonly YEAR_2020 = new Date("2020-01-01").getTime() * 1000;
    private foundBundleCallBacks: BroadcastFunc[] = [];
    // Awkward, but need to use strings to represent objects, since we won't always
    // have the original reference to use.
    private trxns: TreeMap<BundleInfoTuple, Uint8Array> = new TreeMap(); // BundleInfoTuple => bytes
    private chainInfos: TreeMap<string, BundleInfo> = new TreeMap(); // [Medallion, ChainStart] => BundleInfo
    private activeChains: ClaimedChain[] = [];
    private clearances: TreeMap<string, Clearance> = new TreeMap(); // ContainerId,ClearanceId => Clearance
    private containers: TreeMap<string, Uint8Array> = new TreeMap(); // ContainerId => bytes
    private removals: TreeMap<string, string> = new TreeMap(); // placementId,removalId => ""
    private placements: TreeMap<string, Entry> = new TreeMap(); // ContainerID,Key,PlacementId => Entry
    // key-placement index used to find properties by the container they describe (the key)
    private byKeyPlacement: TreeMap<string, Entry> = new TreeMap(); // Key,PlacementId => Entry
    private identities: Map<string, string> = new Map(); // Medallion,chainStart => identity
    private locations: TreeMap<string, string> = new TreeMap(); // entryId,placementId => containerId,key,placementId
    private byName: TreeMap<string, string> = new TreeMap(); // name,entryMuid => describingMuid
    private bySource: TreeMap<string, Entry> = new TreeMap();
    private byTarget: TreeMap<string, Entry> = new TreeMap();
    private verifyKeys: Map<string, Bytes> = new Map();
    private secretKeys: Map<string, KeyPair> = new Map();
    private symmetricKeys: Map<number, Bytes> = new Map(); // keyId => symmetricKey
    private accumulatorTotals: Map<string, bigint> = new Map();
    constructor(private keepingHistory = true) {
        this.ready = librariesReady;
    }

    getBillionths(muid: Muid, asOf?: AsOf): Promise<bigint> {
        if (asOf)
            throw new Error("asOf Not implemented for accumulators yet");
        const key = muidToString(muid);
        return Promise.resolve(this.accumulatorTotals.get(key) ?? BigInt(0));
    }

    saveKeyPair(keyPair: KeyPair): Promise<void> {
        this.secretKeys.set(bytesToHex(keyPair.publicKey), keyPair);
        return Promise.resolve();
    }

    pullKeyPair(publicKey: Bytes): Promise<KeyPair> {
        return Promise.resolve(this.secretKeys.get(bytesToHex(publicKey)));
    }

    acquireChain(identity: string): Promise<BundleInfo | null> {
        return Promise.resolve(null);
    }

    dumpEntries() {
        dumpTree(this.placements);
    }

    async saveSymmetricKey(symmetricKey: Bytes): Promise<number> {
        if (symmetricKey.length !== 32) {
            throw new Error("symmetric key must be 32 bytes");
        }
        await this.ready;
        const keyId = shorterHash(symmetricKey);
        this.symmetricKeys.set(keyId, symmetricKey);
        return keyId;
    }

    async getSymmetricKey(keyId: number): Promise<Bytes> {
        await this.ready;
        return this.symmetricKeys.get(keyId);
    }

    dropHistory(container?: Muid, before?: AsOf): void {
        throw new Error("not implemented");
    }

    getVerifyKey(chainInfo: [Medallion, ChainStart]): Promise<Bytes> {
        return Promise.resolve(
            this.verifyKeys.get(`${chainInfo[0]},${chainInfo[1]}`),
        );
    }

    stopHistory(): void {
        this.keepingHistory = false;
        this.dropHistory();
    }

    startHistory(): void {
        this.keepingHistory = true;
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

    private claimChain(
        medallion: Medallion,
        chainStart: ChainStart,
        actorId?: ActorId,
    ): Promise<ClaimedChain> {
        const claim = {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime: generateTimestamp(),
        };
        this.activeChains.push(claim);
        return Promise.resolve(claim);
    }

    getChainIdentity(chainInfo: [Medallion, ChainStart]): Promise<string> {
        return Promise.resolve(
            this.identities.get(`${chainInfo[0]},${chainInfo[1]}`),
        );
    }

    async getChainTracker(): Promise<ChainTracker> {
        const chainInfos = this.getChainInfos();
        const chainTracker = buildChainTracker(chainInfos);
        return Promise.resolve(chainTracker);
    }

    private getChainInfos(): Iterable<BundleInfo> {
        return this.chainInfos.values();
    }

    async addBundle(
        bundle: BundleView,
        claimChain?: boolean,
    ): Promise<boolean> {
        await this.ready;
        const bundleBuilder: BundleBuilder = bundle.builder;
        const bundleInfo = bundle.info;
        const { timestamp, medallion, chainStart, priorTime } = bundleInfo;
        const oldChainInfo = this.chainInfos.get(
            medallionChainStartToString([medallion, chainStart]),
        );
        if (oldChainInfo || priorTime) {
            if (oldChainInfo?.timestamp >= timestamp) {
                return false;
            }
            if (oldChainInfo?.timestamp !== priorTime) {
                throw new Error(
                    `missing prior chain entry for ${JSON.stringify(bundleInfo)}, ` +
                        `have ${JSON.stringify(oldChainInfo)}`,
                );
            }
            const priorHash: Bytes = bundleBuilder.getPriorHash();
            if (
                priorHash.length != 32 ||
                !sameData(oldChainInfo.hashCode, priorHash)
            ) {
                throw new Error("bad prior hash");
            }
        }

        const chainInfo: [Medallion, ChainStart] = [
            bundleInfo.medallion,
            bundleInfo.chainStart,
        ];
        let verifyKey: Bytes = emptyBytes;
        const identity: string = bundleBuilder.getIdentity();
        if (bundleInfo.timestamp === bundleInfo.chainStart) {
            ensure(identity, "chain start bundle missing identity");
            this.identities.set(`${chainInfo[0]},${chainInfo[1]}`, identity);
            verifyKey = ensure(bundleBuilder.getVerifyKey());
            this.verifyKeys.set(`${chainInfo[0]},${chainInfo[1]}`, verifyKey);
        } else {
            ensure(!identity, "non-chain start bundle has identity");
            verifyKey = this.verifyKeys.get(`${chainInfo[0]},${chainInfo[1]}`);
        }
        verifyBundle(bundle.bytes, verifyKey);

        if (claimChain) {
            ensure(bundleInfo.timestamp === bundleInfo.chainStart);
            this.claimChain(
                bundleInfo.medallion,
                bundleInfo.chainStart,
                getActorId(),
            );
        }

        this.chainInfos.set(
            medallionChainStartToString([medallion, chainStart]),
            bundleInfo,
        );
        const bundleKey: BundleInfoTuple =
            MemoryStore.bundleInfoToKey(bundleInfo);
        this.trxns.set(bundleKey, bundle.bytes);
        // Decrypt bundle
        const encrypted = bundleBuilder.getEncrypted();
        let changesList: Array<ChangeBuilder>;
        if (encrypted) {
            const keyId = bundleBuilder.getKeyId();
            if (bundleBuilder.getChangesList().length > 0) {
                throw new Error(
                    "did not expect plain changes when using encryption",
                );
            }
            if (!keyId) {
                throw new Error("expected keyId with encrypted bundle");
            }
            const symmetricKey = ensure(
                await this.getSymmetricKey(keyId),
                "could not find symmetric key referenced in bundle",
            );
            const decrypted = decryptMessage(encrypted, symmetricKey);
            const innerBundleBuilder = <BundleBuilder>(
                BundleBuilder.deserializeBinary(decrypted)
            );
            changesList = innerBundleBuilder.getChangesList();
        }
        // Changes list will either come from getChangesList in an unencrypted bundle, or
        // getChangesList from the decrypted inner bundle.
        if (!changesList) changesList = bundleBuilder.getChangesList();
        for (let index = 0; index < changesList.length; index++) {
            const offset = index + 1;
            const changeBuilder = changesList[index];
            ensure(offset > 0);
            const changeAddressTuple: MuidTuple = [
                timestamp,
                medallion,
                offset,
            ];
            const changeAddress = { timestamp, medallion, offset };
            if (changeBuilder.hasContainer()) {
                const containerBytes = changeBuilder
                    .getContainer()
                    .serializeBinary();
                this.containers.set(
                    muidTupleToString(changeAddressTuple),
                    containerBytes,
                );
                continue;
            }
            if (changeBuilder.hasEntry()) {
                const entryBuilder: EntryBuilder = changeBuilder.getEntry();
                let pointeeList = <Indexable[]>[];
                if (entryBuilder.hasPointee()) {
                    pointeeList = buildPointeeList(entryBuilder, bundleInfo);
                }
                let sourceList = <Indexable[]>[];
                let targetList = <Indexable[]>[];
                if (entryBuilder.hasPair()) {
                    [sourceList, targetList] = buildPairLists(
                        entryBuilder,
                        bundleInfo,
                    );
                }
                const entry: Entry = {
                    behavior: entryBuilder.getBehavior(),
                    containerId: extractContainerMuid(entryBuilder, bundleInfo),
                    storageKey: getStorageKey(entryBuilder, changeAddress),
                    entryId: [timestamp, medallion, offset],
                    pointeeList,
                    value: entryBuilder.hasValue()
                        ? unwrapValue(entryBuilder.getValue())
                        : undefined,
                    expiry: entryBuilder.getExpiry() || undefined,
                    deletion: entryBuilder.getDeletion(),
                    placementId: [timestamp, medallion, offset],
                    sourceList,
                    targetList,
                    purging: entryBuilder.getPurge(),
                };
                this.addEntry(entry);
                continue;
            }
            if (changeBuilder.hasMovement()) {
                this.applyMovement(
                    extractMovement(changeBuilder, bundleInfo, offset),
                );
                continue;
            }
            if (changeBuilder.hasClearance()) {
                const clearanceBuilder = changeBuilder.getClearance();
                const container = builderToMuid(
                    clearanceBuilder.getContainer(),
                    { timestamp, medallion, offset },
                );
                const containerMuidTuple: MuidTuple = [
                    container.timestamp,
                    container.medallion,
                    container.offset,
                ];
                const containerIdStr = muidTupleToString(containerMuidTuple);
                if (clearanceBuilder.getPurge()) {
                    // When purging, remove all entries from the container.
                    while (true) {
                        const it = this.placements.lowerBound(containerIdStr);
                        const to = this.placements.upperBound(
                            `${containerIdStr},~,~`,
                        );
                        if (it.equals(to) || !it.key) break;
                        this.placements.erase(it);
                        this.byKeyPlacement.delete(it.key.slice(35));
                        // TODO: also delete removals, locations
                    }
                    // When doing a purging clear, remove previous clearances for the container.
                    const lowerClearances = this.clearances.lowerBound(
                        `${containerIdStr}`,
                    );
                    const upperClearances = this.clearances.upperBound(
                        `${containerIdStr},~`,
                    );
                    while (lowerClearances) {
                        if (lowerClearances.equals(upperClearances)) break;
                        if (
                            muidTupleToString(
                                lowerClearances.value.containerId,
                            ) !== containerIdStr
                        )
                            break;
                        this.clearances.delete(lowerClearances.key);
                        lowerClearances.next();
                    }
                }
                const clearance: Clearance = {
                    containerId: containerMuidTuple,
                    clearanceId: changeAddressTuple,
                    purging: clearanceBuilder.getPurge(),
                };
                // TODO: have entries check to see if there's a purging clearance when accepting an entry
                this.clearances.set(
                    `${containerIdStr},${muidTupleToString(clearance.clearanceId)}`,
                    clearance,
                );
                continue;
            }
            throw new Error("don't know how to apply this kind of change");
        }
        return true;
    }

    private static bundleInfoToKey(bundleInfo: BundleInfo): BundleInfoTuple {
        return [
            bundleInfo.timestamp,
            bundleInfo.medallion,
            bundleInfo.chainStart,
            bundleInfo.priorTime || 0,
            bundleInfo.comment || "",
        ];
    }

    applyMovement(movement: Movement) {
        const { entryId, movementId, dest, purge } = movement;
        const entryIdStr = muidTupleToString(entryId);
        const movementIdStr = muidTupleToString(movementId);
        let entry: Entry;
        if (purge || !this.keepingHistory) {
            const iterator = this.locations.lowerBound(entryIdStr);
            while (true) {
                if (iterator.equals(this.locations.end())) break;
                if (!iterator.key.startsWith(entryIdStr)) break;
                entry = {
                    ...this.placements.get(iterator.value),
                    placementId: movementId,
                    storageKey: dest,
                };
                this.placements.delete(iterator.value);
                this.byKeyPlacement.delete(iterator.value.slice(35));
                this.locations.erase(iterator);
                iterator.next();
            }
        } else {
            const iterator = toLastWithPrefixBeforeSuffix(
                this.locations,
                entryIdStr,
            );
            if (!iterator) {
                console.error(
                    `attempting to move something I don't have any record of: ${entryIdStr}`,
                );
                return;
            }
            ensure(iterator.key && iterator.key.startsWith(entryIdStr));
            entry = {
                ...this.placements.get(iterator.value),
                placementId: movementId,
                storageKey: dest,
            };
            const removingIdStr = iterator.value.slice(-34);
            this.removals.set(`${removingIdStr},${movementIdStr}`, "");
        }
        if (dest !== 0) {
            this.addEntry(entry);
        }
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        return this.containers.get(muidToString(address));
    }

    private asOfToTimestamp(asOf: AsOf): Timestamp {
        if (asOf instanceof Date) {
            return asOf.getTime() * 1000;
        }
        if (asOf > MemoryStore.YEAR_2020) {
            return asOf;
        }
        if (asOf < 0 && asOf > -1000) {
            // Interpret as number of bundles in the past.
            try {
                const trxnKeyArray = Array.from(this.trxns.keys());
                const key = trxnKeyArray[trxnKeyArray.length + asOf];
                return key[0];
            } catch {
                // Looking further back than we have bundles.
                throw new Error("no bundles that far back");
            }
        }
        throw new Error(`don't know how to interpret asOf=${asOf}`);
    }

    getEntryByKey(
        container?: Muid,
        key?: ScalarKey | Muid | [Muid, Muid],
        asOf?: AsOf,
    ): Promise<Entry | undefined> {
        try {
            return Promise.resolve(
                this.getEntryByKeyHelper(container, key, asOf),
            );
        } catch (error) {
            return Promise.reject(error);
        }
    }

    getEntryByKeyHelper(
        container?: Muid,
        key?: ScalarKey | Muid | [Muid, Muid],
        asOf?: AsOf,
    ): Entry | undefined {
        const asOfTs = asOf ? this.asOfToTimestamp(asOf) : generateTimestamp();
        const desiredSrc: [number, number, number] = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const srcAsStr = muidTupleToString(desiredSrc);
        let clearanceTime: Timestamp = this.getLastClearanceTime(
            srcAsStr,
            asOfTs,
        );
        const semanticKey = toStorageKey(key);
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const prefix = `${srcAsStr},${storageKeyToString(semanticKey)},`;
        const iterator = toLastWithPrefixBeforeSuffix(
            this.placements,
            prefix,
            asOfTsStr,
        );
        if (!iterator) return undefined;
        const entry: Entry = iterator.value;
        if (!entry) throw new Error(`missing entry for: ${iterator.value}`);
        if (entry.placementId[0] < clearanceTime) {
            // container was cleared after this entry
            return undefined;
        }
        return entry;
    }

    async getBundles(callBack: (bundle: BundleView) => void) {
        for (const [_, val] of this.trxns) {
            callBack(new Decomposition(val));
        }
    }

    getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined> {
        return Promise.resolve(this.getEntryByIdSync(entryMuid));
    }

    // TODO: allow this to take an as-of timestamp
    getEntryByIdSync(entryMuid: Muid): Entry | undefined {
        const entryIdStr = muidToString(entryMuid);
        const it = toLastWithPrefixBeforeSuffix(this.locations, entryIdStr);
        if (!it) return undefined;
        return this.placements.get(it.value);
    }

    async getKeyedEntries(
        container: Muid,
        asOf?: AsOf,
    ): Promise<Map<string, Entry>> {
        const asOfTs = asOf ? this.asOfToTimestamp(asOf) : generateTimestamp();
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const desiredSrc: [number, number, number] = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const srcAsStr = muidTupleToString(desiredSrc);
        const clearanceTime: Timestamp = this.getLastClearanceTime(
            srcAsStr,
            asOfTs,
        );
        const clearTimeStr = muidTupleToString([clearanceTime, 0, 0]);
        const iterator = this.placements.lowerBound(srcAsStr);

        const result = new Map();
        for (
            ;
            iterator && iterator.key && !iterator.equals(this.placements.end());
            iterator.next()
        ) {
            const parts = iterator.key.split(",");
            if (parts[0] !== srcAsStr) break;
            const placementIdStr = parts[parts.length - 1];
            if (placementIdStr < clearTimeStr || placementIdStr > asOfTsStr)
                continue;
            const entry: Entry = iterator.value;
            ensure(
                entry.behavior === Behavior.DIRECTORY ||
                    entry.behavior === Behavior.KEY_SET ||
                    entry.behavior === Behavior.GROUP ||
                    entry.behavior === Behavior.PAIR_SET ||
                    entry.behavior === Behavior.PAIR_MAP ||
                    entry.behavior === Behavior.PROPERTY,
            );

            const key = storageKeyToString(entry.storageKey);
            if (entry.deletion) result.delete(key);
            else result.set(key, entry);
        }
        return result;
    }

    async getContainersByName(name: string, asOf?: AsOf): Promise<Muid[]> {
        const asOfTs = asOf ? this.asOfToTimestamp(asOf) : generateTimestamp();
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const desiredSrc: [number, number, number] = [
            -1,
            -1,
            Behavior.PROPERTY,
        ];
        const srcAsStr = muidTupleToString(desiredSrc);
        const clearanceTime: Timestamp = this.getLastClearanceTime(
            srcAsStr,
            asOfTs,
        );
        const clearTimeStr = muidTupleToString([clearanceTime, 0, 0]);
        const iterator = this.byName.lowerBound(name);
        const result = [];
        for (
            ;
            iterator && iterator.key && !iterator.equals(this.byName.end());
            iterator.next()
        ) {
            const parts = iterator.key.split(",");
            if (parts[0] !== name) break;

            const entryMuidStr = parts[1];
            if (entryMuidStr < clearTimeStr || entryMuidStr > asOfTsStr)
                continue;
            const describingMuid = strToMuid(iterator.value);
            result.push(describingMuid);
        }
        return result;
    }

    async getContainerProperties(
        containerMuid: Muid,
        asOf?: AsOf,
    ): Promise<Map<string, Value>> {
        const resultMap = new Map<string, Value>();
        const asOfTs = asOf ? this.asOfToTimestamp(asOf) : generateTimestamp();
        const strMuid = muidToString(containerMuid);

        const iterator = this.byKeyPlacement.lowerBound(strMuid);
        for (
            ;
            iterator &&
            iterator.key &&
            !iterator.equals(this.byKeyPlacement.end());
            iterator.next()
        ) {
            const parts = iterator.key.split(",");
            if (parts[0] !== strMuid) break;
            const entry = iterator.value;
            if (!(entry.behavior === Behavior.PROPERTY)) continue;
            const propertyMuid = muidTupleToString(entry.containerId);
            const clearTime = this.getLastClearanceTime(propertyMuid, asOfTs);
            const entryMuid = strToMuid(parts[1]);
            if (
                entryMuid.timestamp < clearTime ||
                entryMuid.timestamp > asOfTs
            ) {
                continue;
            }
            const containerMuid = entry.containerId;
            if (entry.deletion) {
                resultMap.delete(muidTupleToString(containerMuid));
            } else {
                resultMap.set(muidTupleToString(containerMuid), entry.value);
            }
        }
        return resultMap;
    }

    /**
     * Returns entry data for a List.
     * @param container to get entries for
     * @param through number to get, negative for starting from end
     * @param asOf show results as of a time in the past
     * @returns a promise of a list of ChangePairs
     */
    async getOrderedEntries(
        container: Muid,
        through = Infinity,
        asOf?: AsOf,
    ): Promise<Map<string, Entry>> {
        return Promise.resolve(
            this.getOrderedEntriesSync(container, through, asOf),
        );
    }

    getOrderedEntriesSync(
        container: Muid,
        through = Infinity,
        asOf?: AsOf,
    ): Map<string, Entry> {
        const asOfTs: Timestamp = asOf
            ? this.asOfToTimestamp(asOf)
            : generateTimestamp();
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const commaAsOfTsStr = "," + muidTupleToString([asOfTs, 0, 0]);
        const containerId: [number, number, number] = [
            container?.timestamp ?? 0,
            container?.medallion ?? 0,
            container?.offset ?? 0,
        ];
        const containerIdStr = muidTupleToString(containerId);
        let clearanceTime: Timestamp = this.getLastClearanceTime(
            containerIdStr,
            asOfTs,
        );
        const clearanceTimeStr = muidTupleToString([clearanceTime, 0, 0]);
        // TODO: switch sequence key to be appropriately padded/encoded
        const lower = this.placements.lowerBound(`${containerIdStr}`);
        const upper = this.placements.upperBound(`${containerIdStr},${asOfTs}`);

        const returning = new Map<string, Entry>();

        // If we need to iterate forward or backward
        let it: MapIterator<string, Entry>;
        if (through < 0) {
            it = upper;
            it.prev();
        } else {
            it = lower;
        }
        const needed = through < 0 ? -through : through + 1;
        for (; returning.size < needed; through < 0 ? it.prev() : it.next()) {
            // '0616C86BB4D7B4-1A86FC813F72F-00001,1713899916549000,0616C86BB4DB88-1A86FC813F72F-00001'
            const placementKey = it.key;
            if (!placementKey) break;
            const foundContainerStr = placementKey.substring(0, 34);
            if (foundContainerStr !== containerIdStr) break;
            const placementIdStr = placementKey.slice(-34);
            if (placementIdStr < clearanceTimeStr || placementIdStr > asOfTsStr)
                continue;
            if (
                toLastWithPrefixBeforeSuffix(
                    this.removals,
                    placementIdStr,
                    commaAsOfTsStr,
                )
            )
                continue;
            const returningKey = placementKey.substring(35);
            const entry: Entry = it.value;
            ensure(muidTupleToString(entry.containerId) === containerIdStr);
            returning.set(returningKey, entry);
        }
        return returning;
    }

    getLocation(entry: Muid, asOf?: AsOf): Promise<Placement | undefined> {
        const asOfTs: Timestamp = asOf
            ? this.asOfToTimestamp(asOf)
            : generateTimestamp();
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const prefix = `${muidToString(entry)}`;
        const suffix = `${muidToString(entry)},${asOfTsStr}`;
        const it = toLastWithPrefixBeforeSuffix(this.locations, prefix, suffix);
        if (!it) return undefined;
        const parts = it.value.split(",");

        const containerIdStr = parts[0];
        const key = parts[1];
        const placementIdStr = parts[2];
        const placementTuple = strToMuidTuple(placementIdStr);
        const lastClear = this.getLastClearanceTime(containerIdStr, asOfTs);
        const removal = toLastWithPrefixBeforeSuffix(
            this.removals,
            placementIdStr,
            `${placementIdStr},${asOfTsStr}`,
        );
        if (lastClear > placementTuple[0] || removal) return undefined;
        return Promise.resolve({
            container: strToMuidTuple(containerIdStr),
            key: key,
            placement: placementTuple,
        });
    }

    addEntry(entry: Entry) {
        const entryIdStr = muidTupleToString(entry.entryId);
        const containerIdStr = muidTupleToString(entry.containerId);
        const placementIdStr = muidTupleToString(entry.placementId);
        const placementKey = `${containerIdStr},${storageKeyToString(entry.storageKey)},${placementIdStr}`;
        const behavior = entry.behavior;

        if (behavior === Behavior.SEQUENCE || behavior === Behavior.EDGE_TYPE) {
            this.locations.set(`${entryIdStr},${placementIdStr}`, placementKey);
        } else {
            const containerIdStr = muidTupleToString(entry.containerId);
            const prefix = `${containerIdStr},${storageKeyToString(entry.storageKey)}`;
            for (
                let iterator = toLastWithPrefixBeforeSuffix(
                    this.placements,
                    prefix,
                );
                iterator && iterator.key && iterator.key.startsWith(prefix);
                iterator.prev()
            ) {
                if (entry.purging || !this.keepingHistory) {
                    this.placements.erase(iterator);
                    this.byKeyPlacement.delete(iterator.key.slice(35));
                } else {
                    const placementIdStr = iterator.key.slice(-34);
                    this.removals.set(`${placementIdStr},${entryIdStr}`, "");
                }
            }
        }
        this.placements.set(placementKey, entry);
        if (behavior == Behavior.ACCUMULATOR) {
            const delta = entry.value;
            if (typeof delta !== "bigint") throw new Error("Accumulator increment not an integer?");
            let total = this.accumulatorTotals.get(containerIdStr) ?? BigInt(0);
            total = total + delta;
            this.accumulatorTotals.set(containerIdStr, total);
            return;
        }
        this.byKeyPlacement.set(
            `${storageKeyToString(entry.storageKey)},${placementIdStr}`,
            entry,
        );
        if (entry.sourceList.length) {
            // TODO: remove these on deletion/purge
            const middle =
                behavior === Behavior.EDGE_TYPE
                    ? storageKeyToString(entry.storageKey)
                    : "";
            const sourceIdStr = muidTupleToString(entry.sourceList[0]);
            this.bySource.set(
                `${sourceIdStr},${middle},${placementIdStr}`,
                entry,
            );
            ensure(entry.targetList.length);
            const targetIdStr = muidTupleToString(entry.targetList[0]);
            this.byTarget.set(
                `${targetIdStr},${middle},${placementIdStr}`,
                entry,
            );
        }

        if (entry.behavior == Behavior.PROPERTY && entry.containerId[0] == -1) {
            if (
                Array.isArray(entry.storageKey) &&
                entry.storageKey.length == 3
            ) {
                let globalPropIterator = toLastWithPrefixBeforeSuffix(
                    this.placements,
                    containerIdStr,
                );
                for (
                    let iterator = globalPropIterator;
                    iterator &&
                    iterator.key &&
                    iterator.key.startsWith(containerIdStr);
                    iterator.prev()
                ) {
                    const foundEntry = iterator.value;
                    if (
                        foundEntry.storageKey.toString() ===
                            entry.storageKey.toString() &&
                        foundEntry.value !== entry.value
                    ) {
                        this.byName.delete(
                            foundEntry.value +
                                "," +
                                muidTupleToString(foundEntry.entryId),
                        );
                    }
                }
                this.byName.set(
                    entry.value + "," + muidTupleToString(entry.entryId),
                    muidTupleToString(entry.storageKey),
                );
            } else {
                throw new Error("global property storage key isnt a tuple?");
            }
        }

        if (entry.behavior == Behavior.PROPERTY && entry.containerId[0] == -1) {
            if (
                Array.isArray(entry.storageKey) &&
                entry.storageKey.length == 3
            ) {
                let globalPropIterator = toLastWithPrefixBeforeSuffix(
                    this.placements,
                    containerIdStr,
                );
                for (
                    let iterator = globalPropIterator;
                    iterator &&
                    iterator.key &&
                    iterator.key.startsWith(containerIdStr);
                    iterator.prev()
                ) {
                    const foundEntry = iterator.value;
                    if (
                        foundEntry.storageKey.toString() ===
                            entry.storageKey.toString() &&
                        foundEntry.value !== entry.value
                    ) {
                        this.byName.delete(
                            foundEntry.value +
                                "," +
                                muidTupleToString(foundEntry.entryId),
                        );
                    }
                }
                this.byName.set(
                    entry.value + "," + muidTupleToString(entry.entryId),
                    muidTupleToString(entry.storageKey),
                );
            } else {
                throw new Error("global property storage key isnt a tuple?");
            }
        }
    }

    /**
     * Returns the timestamp of the last clearance for any given container.
     * @param containerId container muid as a string
     * @param asOf optional timestamp to query - finds the last clearance within the timeframe.
     * @returns the timestamp of the last clearance, or 0 if one wasn't found.
     */
    getLastClearanceTime(containerId: string, asOf?: Timestamp): number {
        const asOfStr = asOf ? muidTupleToString([asOf, 0, 0]) : "~";
        const upperClearance = this.clearances.upperBound(
            `${containerId},${asOfStr}`,
        );
        upperClearance.prev();
        let clearanceTime: number = 0;
        if (
            upperClearance.value &&
            sameData(
                containerId,
                muidTupleToString(upperClearance.value.containerId),
            )
        ) {
            clearanceTime = upperClearance.value.clearanceId[0];
        }
        return clearanceTime;
    }

    getEntriesBySourceOrTarget(
        vertex: Muid,
        source: boolean,
        asOf?: AsOf,
    ): Promise<Entry[]> {
        return Promise.resolve(
            this.getEntriesBySourceOrTargetSync(vertex, source, asOf),
        );
    }

    getEntriesBySourceOrTargetSync(
        vertex: Muid,
        source: boolean,
        asOf?: AsOf,
    ): Entry[] {
        const asOfTs: Timestamp = asOf
            ? this.asOfToTimestamp(asOf)
            : generateTimestamp();
        const vertexIdStr = muidToString(vertex);
        const map = source ? this.bySource : this.byTarget;
        const entries: Entry[] = [];
        for (
            const it = map.lowerBound(vertexIdStr);
            it.key && it.key.startsWith(vertexIdStr);
            it.next()
        ) {
            const entry = it.value;
            if (this.isSoftDeleted(entry, asOfTs)) continue;
            if (entry.placementId[0] > asOfTs) continue;
            entries.push(it.value);
        }
        return entries;
    }

    getAllContainerTuples(): Promise<MuidTuple[]> {
        const arr = [];
        arr.push([-1, -1, 4], [-1, -1, 10]);
        for (const containerIdStr of this.containers.keys()) {
            arr.push(strToMuidTuple(containerIdStr));
        }
        return Promise.resolve(arr);
    }

    isSoftDeleted(entry: Entry, asOfTs: Timestamp): boolean {
        const placementIdStr = muidTupleToString(entry.placementId);
        const asOfTsStr = muidTupleToString([asOfTs, 0, 0]);
        const upperBound = `${placementIdStr},${asOfTsStr}`;
        for (
            const it = this.removals.lowerBound(placementIdStr);
            it.key && it.key < upperBound;
            it.next()
        ) {
            return true;
        }
        return false;
    }

    async close(): Promise<void> {
        await this.ready;
        delete this.trxns;
        delete this.chainInfos;
        delete this.activeChains;
        delete this.clearances;
        delete this.containers;
        delete this.removals;
        delete this.placements;
        return Promise.resolve();
    }

    // for debugging, not part of the api/interface
    getAllEntryKeys(): Array<string> {
        return Array.from(this.placements.keys());
    }

    // for debugging, not part of the api/interface
    getAllEntries(): Array<Entry> {
        return Array.from(this.placements.values());
    }

    // for debugging, not part of the api/interface
    getAllRemovals(): TreeMap<string, string> {
        return this.removals;
    }

    addFoundBundleCallBack(callback: BroadcastFunc): void {
        this.foundBundleCallBacks.push(callback);
    }
}
