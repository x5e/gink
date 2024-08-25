import {
    Medallion,
    ChainStart,
    Timestamp,
    BundleView,
} from "../implementation/typedefs";
import { Store } from "../implementation/Store";
import { BundleBuilder } from "../implementation/builders";
import { Decomposition } from "../implementation/Decomposition";
import {
    createKeyPair,
    signBundle,
    librariesReady,
    ensure,
} from "../implementation/utils";

export const MEDALLION1 = 425579549941797;
export const START_MICROS1 = Date.parse("2022-02-19 23:24:50") * 1000;
export const NEXT_TS1 = Date.parse("2022-02-20 00:39:29") * 1000;

export const MEDALLION2 = 458510670893748;
export const START_MICROS2 = Date.parse("2022-02-20 00:38:21") * 1000;
export const NEXT_TS2 = Date.parse("2022-02-20 00:40:12") * 1000;

export const keyPair = librariesReady.then(() => createKeyPair());

export async function makeChainStart(
    comment: string,
    medallion: Medallion,
    chainStart: ChainStart
): Promise<BundleView> {
    const bundleBuilder = new BundleBuilder();
    bundleBuilder.setChainStart(chainStart);
    bundleBuilder.setTimestamp(chainStart);
    bundleBuilder.setMedallion(medallion);
    bundleBuilder.setComment(comment);
    bundleBuilder.setVerifyKey((await keyPair).publicKey);
    return new Decomposition(
        signBundle(bundleBuilder.serializeBinary(), (await keyPair).secretKey)
    );
}

export function unbundle(signed: Uint8Array): BundleBuilder {
    const inside = new Decomposition(signed);
    return <BundleBuilder>inside.builder;
}

export async function extendChain(
    comment: string,
    previous: BundleView,
    timestamp: Timestamp
): Promise<BundleView> {
    const bundleBuilder = new BundleBuilder();
    const parsedPrevious = previous.builder;
    bundleBuilder.setMedallion(parsedPrevious.getMedallion());
    bundleBuilder.setPrevious(parsedPrevious.getTimestamp());
    bundleBuilder.setChainStart(parsedPrevious.getChainStart());
    bundleBuilder.setTimestamp(timestamp); // one millisecond later
    bundleBuilder.setComment(comment);
    const priorHash = previous.info.hashCode;
    ensure(priorHash && priorHash.length === 32);
    bundleBuilder.setPriorHash(priorHash);
    return new Decomposition(
        signBundle(bundleBuilder.serializeBinary(), (await keyPair).secretKey)
    );
}

export async function addTrxns(store: Store) {
    const start1 = await makeChainStart(
        "chain1,tx1",
        MEDALLION1,
        START_MICROS1
    );
    await store.addBundle(start1);
    const next1 = await extendChain("chain1,tx2", start1, NEXT_TS1);
    await store.addBundle(next1);
    const start2 = await makeChainStart(
        "chain2,tx1",
        MEDALLION2,
        START_MICROS2
    );
    await store.addBundle(start2);
    const next2 = await extendChain("chain2,2", start2, NEXT_TS2);
    await store.addBundle(next2);
}

export async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
