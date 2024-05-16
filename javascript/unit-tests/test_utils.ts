import { Medallion, ChainStart, Timestamp, BundleView } from "../implementation/typedefs";
import { Store } from "../implementation/Store";
import { BundleBuilder, HeaderBuilder } from "../implementation/builders";
import { Decomposition } from "../implementation/Decomposition";

export const MEDALLION1 = 425579549941797;
export const START_MICROS1 = Date.parse("2022-02-19 23:24:50") * 1000;
export const NEXT_TS1 = Date.parse("2022-02-20 00:39:29") * 1000;

export const MEDALLION2 = 458510670893748;
export const START_MICROS2 = Date.parse("2022-02-20 00:38:21") * 1000;
export const NEXT_TS2 = Date.parse("2022-02-20 00:40:12") * 1000;

export function makeChainStart(comment: string, medallion: Medallion, chainStart: ChainStart): BundleView {
    const bundleBuilder = new BundleBuilder();
    const headerBuilder = new HeaderBuilder();
    headerBuilder.setChainStart(chainStart);
    headerBuilder.setTimestamp(chainStart);
    headerBuilder.setMedallion(medallion);
    headerBuilder.setComment(comment);
    bundleBuilder.setHeader(headerBuilder);
    return new Decomposition(bundleBuilder.serializeBinary());
}

export function extendChain(comment: string, previous: BundleView, timestamp: Timestamp): BundleView {
    const parsedPrevious = previous.builder.getHeader();
    const subsequent = new HeaderBuilder();
    subsequent.setMedallion(parsedPrevious.getMedallion());
    subsequent.setPrevious(parsedPrevious.getTimestamp());
    subsequent.setChainStart(parsedPrevious.getChainStart());
    subsequent.setTimestamp(timestamp); // one millisecond later
    subsequent.setComment(comment);
    const bundleBuilder = new BundleBuilder();
    bundleBuilder.setHeader(subsequent);
    return new Decomposition(bundleBuilder.serializeBinary());
}

export async function addTrxns(store: Store) {
    const start1 = makeChainStart("chain1,tx1", MEDALLION1, START_MICROS1);
    await store.addBundle(start1);
    const next1 = extendChain("chain1,tx2", start1, NEXT_TS1);
    await store.addBundle(next1);
    const start2 = makeChainStart("chain2,tx1", MEDALLION2, START_MICROS2);
    await store.addBundle(start2);
    const next2 = extendChain("chain2,2", start2, NEXT_TS2);
    await store.addBundle(next2);
}


export async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
