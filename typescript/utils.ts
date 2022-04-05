import { Medallion, ChainStart, SeenThrough, HasMap } from "./typedefs"
import { Greeting, Message } from "messages_pb";

export var assert = assert || function (x: any, msg?: string) {
    if (!x) throw new Error(msg ?? "assert failed");
}

export function now() { return (new Date()).toISOString(); }

export function noOp() {};

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
 * The Message proto contains an embedded oneof.  Essentially this will wrap
 * the commit bytes payload in a wrapper by prefixing a few bytes to it.
 * In theory the "Message" proto could be expanded with some extra metadata
 * (e.g. send time) in the future.
 * Note that the commit is always passed around as bytes and then
 * re-parsed as needed to avoid losing unknown fields.
 * @param commitBytes: the bytes corresponding to a commit
 * @returns a serialized "Message" proto
 */
export function makeCommitMessage(commitBytes: Uint8Array): Uint8Array {
    const message = new Message();
    message.setCommit(commitBytes);
    const msgBytes = message.serializeBinary();
    return msgBytes;
}

export function makeMedallion() {
    // TODO: figure out a cryptographically secure random number generator
    // that will work in both node and the browser.
    const result = Math.floor(Math.random() * (2**48)) + 2**48;
    assert(result < 2**49 && result > 2**48);
    return result;
}