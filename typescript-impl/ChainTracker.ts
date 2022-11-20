import { ChangeSetInfo, Medallion, ChainStart, SeenThrough, Muid, CallBack, Timestamp } from "./typedefs";
import { SyncMessage } from "gink/protoc.out/sync_message_pb";


/**
 * A class to keep track of what data a given instance (self or peer) has for each
 * chain.  So it's kind of like Map<[Medallion, ChainStart], SeenThrough>.
 * This is essentially the same data thats in the Greeting message, so I've included
 * functionality to convert from/to Greeting objects.
 */
export class ChainTracker {
    private readonly data: Map<Medallion, Map<ChainStart, ChangeSetInfo>> = new Map();
    private readonly waiters: Map<CallBack, [Medallion, Timestamp]> = new Map();

    constructor({ greetingBytes = null, greeting = null }) {
        if (greetingBytes) {
            greeting = SyncMessage.Greeting.deserializeBinary(greetingBytes)
        }
        if (!greeting) return;
        for (const entry of greeting.getEntriesList()) {
            const medallion: Medallion = entry.getMedallion();
            const chainStart: ChainStart = entry.getChainStart();
            const timestamp: SeenThrough = entry.getSeenThrough();
            if (!this.data.has(medallion)) {
                this.data.set(medallion, new Map());
            }
            this.data.get(medallion).set(chainStart, { medallion, chainStart, timestamp });
        }
    }

    /**
     * Allows you to wait until an instance has seen a particular change set.
     * @param what either a muid address or a change set info (indicates what to watch for)
     * @param timeoutMs how long to wait before giving up, default of undefined doesn't timeout
     * @returns a promise that resolves when the thing has been marked as seen, or rejects at timeout
     */
    waitTillHas({ medallion, timestamp }: ChangeSetInfo | Muid, timeoutMs?: number): Promise<void> {
        const innerMap = this.data.get(medallion);
        if (innerMap) {
            for (const [chainStart, changeSetInfo] of innerMap.entries()) {
                if (chainStart <= timestamp && changeSetInfo.timestamp >= timestamp)
                    return Promise.resolve();
            }
        }
        const waiters = this.waiters;
        //TODO: prune waiters after their timeout
        return new Promise((resolve, reject) => {
            if (timeoutMs)
                setTimeout(reject, timeoutMs);
            waiters.set(resolve, [medallion, timestamp]);
        });
    }

    /**
     * First, determine if the commit is novel (represents data not previously marked),
     * then second, mark the data in the data structure (possibly checking that its a sensible extension).
     * Note that checkValidExtension is used here as a safeguard to make sure we don't
     * send broken chains to the peer; the store should have its own check for receving.
     * @param commitInfo Metadata about a particular commit.
     * @param checkValidExtension If true then barfs if this commit isn't a vaild extension.
     * @returns true if the commit represents data not seen before
     */
    markAsHaving(commitInfo: ChangeSetInfo, checkValidExtension?: Boolean): Boolean {
        if (!this.data.has(commitInfo.medallion))
            this.data.set(commitInfo.medallion, new Map());
        const innerMap = this.data.get(commitInfo.medallion);
        const seenThrough = innerMap.get(commitInfo.chainStart)?.timestamp || 0;
        if (commitInfo.timestamp > seenThrough) {
            if (checkValidExtension) {
                if (commitInfo.timestamp != commitInfo.chainStart && !commitInfo.priorTime)
                    throw new Error(`commitInfo appears to be invalid: ${JSON.stringify(commitInfo)}`);
                if ((commitInfo.priorTime ?? 0) != seenThrough)
                    throw new Error(`proposed commit would be an invalid extension ${JSON.stringify(commitInfo)}`);
            }
            innerMap.set(commitInfo.chainStart, commitInfo);
            for (const [cb, pair] of this.waiters) {
                if (pair[0] == commitInfo.medallion && pair[1] >= commitInfo.chainStart && pair[1] <= commitInfo.timestamp) {
                    this.waiters.delete(cb);
                    cb();
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Constructs the greeting for use during the initial handshake.  Note that
     * the priorTimes aren't included, so receipient should not markIfNovel using
     * @returns 
     */
    private constructGreeting(): SyncMessage.Greeting {
        const greeting = new SyncMessage.Greeting();
        for (const [medallion, medallionMap] of this.data) {
            for (const [chainStart, commitInfo] of medallionMap) {
                const entry = new SyncMessage.Greeting.GreetingEntry();
                entry.setMedallion(medallion);
                entry.setChainStart(chainStart);
                entry.setSeenThrough(commitInfo.timestamp);
                greeting.addEntries(entry);
            }
        }
        return greeting;
    }

    /**
    * @returns bytes that can be sent during the initial handshake
    */
    getGreetingMessageBytes(): Uint8Array {
        const greeting = this.constructGreeting();
        const msg = new SyncMessage();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    /**
     * Returns how far along data is seen for a particular chain.
     * @param key A [Medallion, ChainStart] tuple
     * @returns SeenThrough (a Timestamp) or undefined if not yet seen
     */
    getCommitInfo(key: [Medallion, ChainStart]): ChangeSetInfo | undefined {
        const inner = this.data.get(key[0]);
        if (!inner) return undefined;
        return inner.get(key[1]);
    }

    /**
     * Gets a list of chains seen for a particular medallion, or a list of all seen chains
     * @param singleMedallion The single medallion to get chains for (returns all if undefined)
     * @returns a list of known chains
     */
    getChains(singleMedallion?: Medallion): Array<[Medallion, ChainStart]> {
        const result = [];
        for (const [medallion, map] of this.data.entries()) {
            if (singleMedallion && medallion != singleMedallion) continue;
            for (const chainStart of map.keys()) {
                result.push([medallion, chainStart]);
            }
        }
        return result;
    }
}
