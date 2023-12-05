import { Behavior, ChangeBuilder, BundleBuilder, EntryBuilder, MovementBuilder, MuidBuilder } from "./builders";
import { KeyType, Timestamp, MuidTuple, Muid, BundleInfo, Indexable } from "./typedefs";
import {
    ensure,
    unwrapKey,
    builderToMuid,
    muidToTuple,
    muidToString,
    dehydrate
} from "./utils";
import { Container } from "./Container";

export function getEffectiveKey(entryBuilder: EntryBuilder, timestamp: Timestamp):
    [KeyType | MuidTuple | [], boolean] {
    const behavior: Behavior = entryBuilder.getBehavior();
    let effectiveKey: KeyType | Timestamp | MuidTuple | [];
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
    return [effectiveKey, replacing]
}

export function extractMovementInfo(changeBuilder: ChangeBuilder, bundleInfo: BundleInfo, offset: number) {
    const movementBuilder: MovementBuilder = changeBuilder.getMovement();
    const entryMuid = movementBuilder.getEntry();
    const entryId: MuidTuple = [
        entryMuid.getTimestamp() || bundleInfo.timestamp,
        entryMuid.getMedallion() || bundleInfo.medallion,
        entryMuid.getOffset()];
    const movementId: MuidTuple = [bundleInfo.timestamp, bundleInfo.medallion, offset];
    const containerId: MuidTuple = [0, 0, 0];
    if (movementBuilder.hasContainer()) {
        const srcMuid: MuidBuilder = movementBuilder.getContainer();
        containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
        containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
        containerId[2] = srcMuid.getOffset();
    }
    return {
        movementBuilder,
        entryId,
        movementId,
        containerId
    }
}

export function extractContainerMuid(entryBuilder: EntryBuilder, bundleInfo: BundleInfo): MuidTuple {
    const containerId: MuidTuple = [0, 0, 0];
    const srcMuid: MuidBuilder = entryBuilder.getContainer();
    containerId[0] = srcMuid.getTimestamp() || bundleInfo.timestamp;
    containerId[1] = srcMuid.getMedallion() || bundleInfo.medallion;
    containerId[2] = srcMuid.getOffset();
    return containerId;
}

export function buildPointeeList(entryBuilder: EntryBuilder, bundleInfo: BundleInfo): Array<MuidTuple> {
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

export function buildPairLists(entryBuilder: EntryBuilder, bundleInfo: BundleInfo): Array<Array<MuidTuple>> {
    const sourceList = <Indexable[]>[];
    const targetList = <Indexable[]>[];
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

    return [sourceList, targetList]
}

export function medallionChainStartToString(tuple: [number, number]): string {
    // this is for [Medallion, ChainStart] keys
    return `${tuple[0]}, ${tuple[1]}`;
}

export function muidPairToSemanticKey(key: [Muid | Container, Muid | Container]): string {
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
    return `${muidToString(leftMuid)}-${muidToString(riteMuid)}`;
}

export function extractCommitInfo(bundleData: Uint8Array | BundleBuilder): BundleInfo {
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
