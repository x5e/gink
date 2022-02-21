import {Medallion, ChainStart, SeenThrough, GreetingBytes, HasMap} from "./typedefs"
import { Greeting } from "messages_pb";

export function makeHasMap(greetingBytes?: GreetingBytes): HasMap {
    const hasMap: HasMap = new Map();
    if (greetingBytes) {
        const parsed = Greeting.deserializeBinary(greetingBytes)
        for (let entry of parsed.getEntriesList()) {
            const medallion: Medallion = entry.getMedallion();
            const chainStart: ChainStart = entry.getChainStart();
            const seenThrough: SeenThrough = entry.getSeenThrough();
            if (!hasMap.has(medallion)) {
                hasMap.set(medallion, new Map());
            }
            hasMap.get(medallion).set(chainStart, seenThrough);
        }
    }
    return hasMap;
}