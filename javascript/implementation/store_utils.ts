import { HasMap } from "./HasMap";
import {
    Behavior,
    ChangeBuilder,
    EntryBuilder,
    MovementBuilder,
    MuidBuilder,
} from "./builders";
import {
    ScalarKey,
    StorageKey,
    MuidTuple,
    Muid,
    BundleInfo,
    Indexable,
    BundleInfoTuple,
    Movement,
    Value,
    Bundler,
} from "./typedefs";
import {
    ensure,
    unwrapKey,
    builderToMuid,
    muidToTuple,
    dehydrate,
    intToHex,
    muidTupleToString,
    muidToBuilder,
    wrapValue,
} from "./utils";
import { Container } from "./Container";

/**
 *
 * @param entryBuilder
 * @param entryMuid
 * @returns A well defined string that's different for each valid key, given the behavior
 */
export function getStorageKey(
    entryBuilder: EntryBuilder,
    entryMuid: Muid,
): StorageKey {
    const behavior: Behavior = entryBuilder.getBehavior();
    if (behavior === Behavior.DIRECTORY || behavior === Behavior.KEY_SET) {
        ensure(entryBuilder.hasKey());
        const key = unwrapKey(entryBuilder.getKey());
        // if (key instanceof Uint8Array) return [key.toString()];
        return key;
    } else if (
        behavior === Behavior.SEQUENCE ||
        behavior === Behavior.EDGE_TYPE
    ) {
        return entryBuilder.getEffective() || entryMuid.timestamp;
    } else if (
        behavior === Behavior.BOX ||
        behavior === Behavior.VERTEX ||
        behavior == Behavior.ACCUMULATOR
    ) {
        return [];
    } else if (behavior === Behavior.PROPERTY || behavior === Behavior.GROUP) {
        ensure(entryBuilder.hasDescribing());
        return muidToTuple(
            builderToMuid(entryBuilder.getDescribing(), entryMuid),
        );
    } else if (
        behavior === Behavior.PAIR_SET ||
        behavior === Behavior.PAIR_MAP
    ) {
        ensure(entryBuilder.hasPair());
        const pair = entryBuilder.getPair();
        const left = builderToMuid(pair.getLeft(), entryMuid);
        const rite = builderToMuid(pair.getRite(), entryMuid);
        return [muidToTuple(left), muidToTuple(rite)];
    } else {
        throw new Error(`unexpected behavior: ${behavior}`);
    }
}

export function storageKeyToString(storageKey: StorageKey): string {
    if (storageKey instanceof Uint8Array) return `(${storageKey})`;
    if (Array.isArray(storageKey)) {
        if (storageKey.length === 3) {
            return muidTupleToString(<MuidTuple>storageKey);
        }
        return storageKey.toString();
    }
    if (typeof storageKey === "number" || typeof storageKey === "string")
        return JSON.stringify(storageKey);
}

export function extractMovement(
    changeBuilder: ChangeBuilder,
    bundleInfo: BundleInfo,
    offset: number,
): Movement {
    const movementBuilder: MovementBuilder = changeBuilder.getMovement();
    const entryMuid = movementBuilder.getEntry();
    const entryId: MuidTuple = [
        entryMuid.getTimestamp() || bundleInfo.timestamp,
        entryMuid.getMedallion() || bundleInfo.medallion,
        entryMuid.getOffset(),
    ];
    const movementId: MuidTuple = [
        bundleInfo.timestamp,
        bundleInfo.medallion,
        offset,
    ];
    const containerId: MuidTuple = [0, 0, 0];
    if (movementBuilder.hasContainer()) {
        const srcMuid: MuidBuilder = movementBuilder.getContainer();
        containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
        containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
        containerId[2] = srcMuid.getOffset();
    }
    return {
        entryId,
        movementId,
        containerId,
        dest: movementBuilder.getDest(),
        purge: movementBuilder.getPurge(),
    };
}

/**
 * Bundles a movement change into the provided bundler
 * @param bundler The bundler to add the change to
 * @param entryMuid The muid of the entry to move
 * @param containerMuid The muid of the container that holds this entry
 * @param dest Destination to move the entry to. If omitted, the entry is removed.
 * @param purge Purge the entry from the internal store?
 */
export async function movementHelper(
    bundler: Bundler,
    entryMuid: Muid,
    containerMuid: Muid,
    dest?: number,
    purge?: boolean,
): Promise<void> {
    const movementBuilder = new MovementBuilder();
    movementBuilder.setEntry(muidToBuilder(entryMuid));
    if (dest) movementBuilder.setDest(dest);
    movementBuilder.setContainer(muidToBuilder(containerMuid));
    if (purge) movementBuilder.setPurge(true);
    const changeBuilder = new ChangeBuilder();
    changeBuilder.setMovement(movementBuilder);
    bundler.addChange(changeBuilder);
}

export function extractContainerMuid(
    entryBuilder: EntryBuilder,
    bundleInfo: BundleInfo,
): MuidTuple {
    const containerId: MuidTuple = [0, 0, 0];
    const srcMuid: MuidBuilder = entryBuilder.getContainer();
    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
    containerId[2] = srcMuid.getOffset();
    return containerId;
}

export function buildPointeeList(
    entryBuilder: EntryBuilder,
    bundleInfo: BundleInfo,
): Array<MuidTuple> {
    const pointeeList = <Indexable[]>[];
    const pointeeMuidBuilder: MuidBuilder = entryBuilder.getPointee();
    const pointee = dehydrate({
        timestamp: pointeeMuidBuilder.getTimestamp() || bundleInfo.timestamp,
        medallion: pointeeMuidBuilder.getMedallion() || bundleInfo.medallion,
        offset: pointeeMuidBuilder.getOffset(),
    });
    pointeeList.push(pointee);
    return pointeeList;
}

export function buildPairLists(
    entryBuilder: EntryBuilder,
    bundleInfo: BundleInfo,
): Array<Array<MuidTuple>> {
    const sourceList = <Indexable[]>[];
    const targetList = <Indexable[]>[];
    const pairBuilder = entryBuilder.getPair();
    const source = dehydrate({
        timestamp: pairBuilder.getLeft().getTimestamp() || bundleInfo.timestamp,
        medallion: pairBuilder.getLeft().getMedallion() || bundleInfo.medallion,
        offset: pairBuilder.getLeft().getOffset(),
    });
    sourceList.push(source);
    const target = dehydrate({
        timestamp: pairBuilder.getRite().getTimestamp() || bundleInfo.timestamp,
        medallion: pairBuilder.getRite().getMedallion() || bundleInfo.medallion,
        offset: pairBuilder.getRite().getOffset(),
    });
    targetList.push(target);

    return [sourceList, targetList];
}

export function medallionChainStartToString(tuple: [number, number]): string {
    // this is for [Medallion, ChainStart] keys
    return `${intToHex(tuple[0])}-${intToHex(tuple[1])}`;
}

export function buildChainTracker(chainInfos: Iterable<BundleInfo>): HasMap {
    const hasMap: HasMap = new HasMap({});
    for (const value of chainInfos) {
        hasMap.markAsHaving(value);
    }
    return hasMap;
}

export function toStorageKey(
    key: ScalarKey | Muid | [Muid | Container, Muid | Container],
): StorageKey {
    if (key instanceof Uint8Array) return key;
    if (typeof key === "number" || typeof key === "string") {
        return key;
    } else if (Array.isArray(key)) {
        return [muidToTuple(<Muid>key[0]), muidToTuple(<Muid>key[1])];
    } else if (key) {
        const muidKey = <Muid>key;
        return [muidKey.timestamp, muidKey.medallion, muidKey.offset];
    }
    if (key === undefined || key === null) {
        return [];
    }
}

export function bundleKeyToInfo(bundleKey: BundleInfoTuple) {
    return {
        timestamp: bundleKey[0],
        medallion: bundleKey[1],
        chainStart: bundleKey[2],
        priorTime: bundleKey[3],
        comment: bundleKey[4],
    };
}

export function bundleInfoToKey(bundleInfo: BundleInfo): BundleInfoTuple {
    return [
        bundleInfo.timestamp,
        bundleInfo.medallion,
        bundleInfo.chainStart,
        bundleInfo.priorTime || 0,
        bundleInfo.comment || "",
    ];
}

/**
 * Utility function to add a property entry change to a bundler without reconstructing the property.
 * @param bundler required bundler to add this change to
 * @param propertyMuid the Muid of the property to add this entry to
 * @param containerMuid the Muid of the container this value is describing
 * @param value the property value associated with the container. If omitted, the property is deleted.
 */
export function bundlePropertyEntry(
    bundler: Bundler,
    propertyMuid: Muid,
    containerMuid: Muid,
    value?: Value,
): Muid {
    const entryBuilder = new EntryBuilder();
    entryBuilder.setDescribing(muidToBuilder(containerMuid));
    entryBuilder.setBehavior(Behavior.PROPERTY);
    entryBuilder.setContainer(muidToBuilder(propertyMuid));
    if (value) entryBuilder.setValue(wrapValue(value));
    else entryBuilder.setDeletion(true);
    const changeBuilder = new ChangeBuilder();
    changeBuilder.setEntry(entryBuilder);
    return bundler.addChange(changeBuilder);
}
