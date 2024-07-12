import { BundleInfo, Medallion, ChainStart, SeenThrough, Muid, CallBack, Timestamp } from "./typedefs";
import { SyncMessageBuilder, GreetingBuilder, GreetingEntryBuilder } from "./builders";


/**
 * A class to keep track of what data a given instance (self or peer) has for each
 * chain.  So it's kind of like Map<[Medallion, ChainStart], SeenThrough>.
 * This is essentially the same data that's in the Greeting message, so I've included
 * functionality to convert from/to Greeting objects.
 */
export class ChainTracker {
    private readonly data: Map<Medallion, Map<ChainStart, BundleInfo>> = new Map();
    private readonly waiters: Map<CallBack, [Medallion, Timestamp]> = new Map();

    constructor({ greetingBytes = null, greeting = null }) {
        if (greetingBytes) {
            greeting = GreetingBuilder.deserializeBinary(greetingBytes);
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
     * Allows you to wait until an instance has seen a particular bundle.
     * @param what either a muid address or a bundle info (indicates what to watch for)
     * @param timeoutMs how long to wait before giving up, default of undefined doesn't time out
     * @returns a promise that resolves when the thing has been marked as seen, or rejects at timeout
     */
    waitTillHas({ medallion, timestamp }: BundleInfo | Muid, timeoutMs?: number): Promise<void> {
        const innerMap = this.data.get(medallion);
        if (innerMap) {
            for (const [chainStart, bundleInfo] of innerMap.entries()) {
                if (chainStart <= timestamp && bundleInfo.timestamp >= timestamp)
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
     * First, determine if the bundle is novel (represents data not previously marked),
     * then second, mark the data in the data structure (possibly checking that it's a sensible extension).
     * Note that checkValidExtension is used here as a safeguard to make sure we don't
     * send broken chains to the peer; the store should have its own check for receiving.
     * @param bundleInfo Metadata about a particular bundle.
     * @param checkValidExtension If true then barfs if this bundle isn't a valid extension.
     * @returns true if the bundle represents data not seen before
     */
    markAsHaving(bundleInfo: BundleInfo, checkValidExtension?: boolean): boolean {
        if (!this.data.has(bundleInfo.medallion))
            this.data.set(bundleInfo.medallion, new Map());
        const innerMap = this.data.get(bundleInfo.medallion);
        const seenThrough = innerMap.get(bundleInfo.chainStart)?.timestamp || 0;
        if (bundleInfo.timestamp > seenThrough) {
            if (checkValidExtension) {
                if (bundleInfo.timestamp != bundleInfo.chainStart && !bundleInfo.priorTime)
                    throw new Error(`bundleInfo appears to be invalid: ${JSON.stringify(bundleInfo)}`);
                if ((bundleInfo.priorTime ?? 0) != seenThrough)
                    throw new Error(`proposed bundle would be an invalid extension ${JSON.stringify(bundleInfo)}`);
            }
            innerMap.set(bundleInfo.chainStart, bundleInfo);
            for (const [cb, pair] of this.waiters) {
                if (pair[0] === bundleInfo.medallion && pair[1] >= bundleInfo.chainStart && pair[1] <= bundleInfo.timestamp) {
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
     * the priorTimes aren't included, so recipient should not markIfNovel using
     * @returns
     */
    private constructGreeting(): GreetingBuilder {
        const greeting = new GreetingBuilder();
        for (const [medallion, medallionMap] of this.data) {
            for (const [chainStart, bundleInfo] of medallionMap) {
                const entry = new GreetingEntryBuilder();
                entry.setMedallion(medallion);
                entry.setChainStart(chainStart);
                entry.setSeenThrough(bundleInfo.timestamp);
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
        const msg = new SyncMessageBuilder();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    /**
     * Returns how far along data is seen for a particular chain.
     * @param key A [Medallion, ChainStart] tuple
     * @returns SeenThrough (a Timestamp) or undefined if not yet seen
     */
    getBundleInfo(key: [Medallion, ChainStart]): BundleInfo | undefined {
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
