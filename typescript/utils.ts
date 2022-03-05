import { Medallion, ChainStart, SeenThrough, HasMap, GreetingBytes } from "./typedefs"
import { Greeting, Message as GinkMessage } from "messages_pb";

export var assert = assert || function (x: any, msg?: string) {
    if (!x) throw new Error(msg ?? "assert failed");
}

export function makeHasMap({ greetingBytes = null, greeting = null }): HasMap {
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

export function hasMapToGreeting(hasMap: HasMap) {
    const greeting = new Greeting();
    for (const [medallion, medallionMap] of hasMap) {
        for (const [chainStart, seenThrough] of medallionMap) {
            const entry = new Greeting.GreetingEntry();
            entry.setMedallion(medallion);
            entry.setChainStart(chainStart);
            entry.setSeenThrough(seenThrough);
            greeting.addEntries(entry);
        }
    }
    return greeting;
}

/**
 * A Gink Message contains an embedded oneof.  Essentially this will wrap
 * the transaction bytes payload in a wrapper by prefixing a few bytes to it.
 * In theory the "Message" proto could be expanded with some extra metadata
 * (e.g. send time) in the future.
 * Note that the transaction is always passed around as bytes and then
 * re-parsed as needed to avoid losing unknown fields.
 * @param commitBytes: the bytes corresponding to a gink commit/transaction
 * @returns a serialized "Message" proto
 */
export function makeCommitMessage(commitBytes: Uint8Array): Uint8Array {
    const ginkMessage = new GinkMessage();
    ginkMessage.setTransaction(commitBytes);
    const msgBytes = ginkMessage.serializeBinary();
    return msgBytes;
}