import { ChainTracker } from './ChainTracker';
import { Behavior, ChangeBuilder, BundleBuilder, EntryBuilder, MovementBuilder, MuidBuilder } from "./builders";
import { KeyType, EffectiveKey, MuidTuple, Muid, BundleInfo, Indexable, BundleInfoTuple } from "./typedefs";
import {
    ensure,
    unwrapKey,
    builderToMuid,
    muidToTuple,
    muidToString,
    dehydrate,
    intToHex
} from "./utils";
import { Container } from "./Container";

/**
 *
 * @param entryBuilder
 * @param entryMuid
 * @returns A well defined string that's different for each valid key, given the behavior
 */
export function getEffectiveKey(entryBuilder: EntryBuilder, entryMuid: Muid): EffectiveKey {
    const behavior: Behavior = entryBuilder.getBehavior();
    if (behavior == Behavior.DIRECTORY || behavior == Behavior.KEY_SET) {
        ensure(entryBuilder.hasKey());
        const key = unwrapKey(entryBuilder.getKey());
        if (key instanceof Uint8Array)
            return [key.toString()];
        return key;
    } else if (behavior == Behavior.SEQUENCE || behavior == Behavior.EDGE_TYPE) {
        return (entryBuilder.getEffective() || entryMuid.timestamp);
    } else if (behavior == Behavior.BOX || behavior == Behavior.VERTEX) {
        return [];
    } else if (behavior == Behavior.PROPERTY || behavior == Behavior.ROLE) {
        ensure(entryBuilder.hasDescribing());
        return muidToTuple(builderToMuid(entryBuilder.getDescribing(), entryMuid));
    } else if (behavior == Behavior.PAIR_SET || behavior == Behavior.PAIR_MAP) {
        ensure(entryBuilder.hasPair());
        const pair = entryBuilder.getPair();
        const left = builderToMuid(pair.getLeft());
        const rite = builderToMuid(pair.getRite());
        return [muidToTuple(left), muidToTuple(rite)];
    } else {
        throw new Error(`unexpected behavior: ${behavior}`);
    }
}

export function effectiveKeyToString(effectiveKey: EffectiveKey): string {
    if (effectiveKey instanceof Uint8Array) return `(${effectiveKey})`;
    if (typeof(effectiveKey) == "number" || typeof(effectiveKey) == "string")
        return JSON.stringify(effectiveKey);
    return effectiveKey.toString();
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
    };
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

    return [sourceList, targetList];
}

export function medallionChainStartToString(tuple: [number, number]): string {
    // this is for [Medallion, ChainStart] keys
    return `${intToHex(tuple[0])}-${intToHex(tuple[1])}`;
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

export function buildChainTracker(chainInfos: Iterable<BundleInfo>): ChainTracker {
    const hasMap: ChainTracker = new ChainTracker({});
    for (const value of chainInfos) {
        hasMap.markAsHaving(value);
    }
    return hasMap;
}

export function userKeyToEffectiveKey(key: KeyType | Muid | [Muid | Container, Muid | Container]):
    EffectiveKey {
    if (key instanceof Uint8Array)
        return [key.toString()];
    if (typeof (key) == "number" || typeof (key) == "string") {
        return key
    } else if (Array.isArray(key)) {
        return [muidToTuple(<Muid>key[0]), muidToTuple(<Muid>key[1])]
    } else if (key) {
        const muidKey = <Muid>key;
        return [muidKey.timestamp, muidKey.medallion, muidKey.offset];
    }
    if (key == undefined || key == null) {
        return [];
    }
}

export function commitKeyToInfo(commitKey: BundleInfoTuple) {
    return {
        timestamp: commitKey[0],
        medallion: commitKey[1],
        chainStart: commitKey[2],
        priorTime: commitKey[3],
        comment: commitKey[4],
    };
}

export function commitInfoToKey(commitInfo: BundleInfo): BundleInfoTuple {
    return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
    commitInfo.priorTime || 0, commitInfo.comment || ""];
}
