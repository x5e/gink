import {Medallion, ChainStart, SeenThrough, HasMap} from "./typedefs"
import { Greeting, Message as GinkMessage } from "messages_pb";

export var assert = assert || function(x: any, msg?: string) {
    if (!x) throw new Error(msg ?? "assert failed");}

export function makeHasMap({greetingBytes=null, greeting=null}): HasMap {
    const hasMap: HasMap = new Map();
    if (greetingBytes) {
        greeting = Greeting.deserializeBinary(greetingBytes)
    }
    assert(greeting, "greeting still null?");
    for (let entry of greeting.getEntriesList()) {
        const medallion: Medallion = entry.getMedallion();
        const chainStart: ChainStart = entry.getChainStart();
        const seenThrough: SeenThrough = entry.getSeenThrough();
        if (!hasMap.has(medallion)) {
            hasMap.set(medallion, new Map());
        }
        hasMap.get(medallion).set(chainStart, seenThrough);
    }
    return hasMap;
}

export function makeCommitMessage(commitBytes: Uint8Array) {
    const ginkMessage = new GinkMessage();
    ginkMessage.setTransaction(commitBytes);
    const msgBytes = ginkMessage.serializeBinary();
    return msgBytes;
}