import { Medallion, ChainStart, ChangeSetBytes, Timestamp } from "../library-code/typedefs";
import { ChangeSet as ChangeSetMessage } from "change_set_pb";
import { Store } from "../library-code/interfaces";

export const MEDALLION1 = 425579549941797;
export const START_MICROS1 = Date.parse("2022-02-19 23:24:50") * 1000;
export const NEXT_TS1 = Date.parse("2022-02-20 00:39:29") * 1000;

export const MEDALLION2 = 458510670893748;
export const START_MICROS2 = Date.parse("2022-02-20 00:38:21") * 1000;
export const NEXT_TS2 = Date.parse("2022-02-20 00:40:12") * 1000;

export function makeChainStart(comment: string, medallion: Medallion, chainStart: ChainStart): ChangeSetBytes {
    const commit = new ChangeSetMessage();
    commit.setChainStart(chainStart);
    commit.setTimestamp(chainStart);
    commit.setMedallion(medallion);
    commit.setComment(comment);
    return commit.serializeBinary();
}

export function extendChain(comment: string, previous: ChangeSetBytes, timestamp: Timestamp): ChangeSetBytes {
    const parsedPrevious = ChangeSetMessage.deserializeBinary(previous);
    const subsequent = new ChangeSetMessage();
    subsequent.setMedallion(parsedPrevious.getMedallion());
    subsequent.setPreviousTimestamp(parsedPrevious.getTimestamp());
    subsequent.setChainStart(parsedPrevious.getChainStart());
    subsequent.setTimestamp(timestamp); // one millisecond later
    subsequent.setComment(comment);
    return subsequent.serializeBinary();
}

export async function addTrxns(store: Store) {
    const start1 = makeChainStart("chain1,tx1", MEDALLION1, START_MICROS1);
    await store.addChangeSet(start1);
    const next1 = extendChain("chain1,tx2", start1, NEXT_TS1);
    await store.addChangeSet(next1);
    const start2 = makeChainStart("chain2,tx1", MEDALLION2, START_MICROS2);
    await store.addChangeSet(start2);
    const next2 = extendChain("chain2,2", start2, NEXT_TS2);
    await store.addChangeSet(next2);
}
