import {
    BundleInfo,
    BundleView,
    ChainStart,
    Connection,
    Medallion,
    Timestamp
} from "./typedefs";
import { HasMap } from "./HasMap";
import { AckBuilder, SyncMessageBuilder } from "./builders";

export class AbstractConnection {
    protected listeners: Array<() => void> = [];
    protected peerHasMap?: HasMap; // Data the peer has said that it has or we have sent it.
    private unacked: Map<Medallion, Map<ChainStart, Timestamp>> = new Map();
    private unackedChains: number = 0;
    private hasSentEverythingState: boolean = false;

    protected resetAbstractConnection() {
        this.unacked = new Map();
        this.unackedChains = 0;
        this.peerHasMap = undefined;
        this.hasSentEverythingState = false;
    }

    get hasSentEverything(): boolean {
        return this.hasSentEverythingState;
    }

    get hasReceivedEverything(): boolean {
        throw new Error("Not implemented");
    }

    markHasSentEverything() {
        this.hasSentEverythingState = true;
        this.notify();
    }

    get hasSentUnackedData(): boolean {
        return this.unackedChains > 0;
    }

    onAck(bundleInfo: BundleInfo) {
        const innerMap = this.unacked.get(bundleInfo.medallion);
        if (!innerMap) {
            console.error("Received an ack for a medallion we don't have?", bundleInfo);
            return;
        }
        const lastSentForThisChain: Timestamp|undefined = innerMap.get(bundleInfo.chainStart);
        if (!lastSentForThisChain) {
            console.error("received an ack for a chain we didn't send?", bundleInfo);
            return;
        }
        if (bundleInfo.timestamp === lastSentForThisChain) {
            innerMap.delete(bundleInfo.chainStart);
            if (this.unackedChains > 0) {
                this.unackedChains--;
                if (this.unackedChains === 0) {
                    this.notify();
                }
            } else {
                console.error("expected unacked chains to be > 0");
            }
        }
    }

    protected notify() {
        this.listeners.forEach(listener => listener());
    }

    subscribe(callback: () => void): () => void {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    send(_: Uint8Array) {
        throw new Error("Not implemented");
    }

    close() {
        throw new Error("Not implemented");
    }

    setPeerHasMap(hasMap?: HasMap) {
        if (this.peerHasMap && hasMap) {
            throw new Error("Already received a HasMap/Greeting from this Peer?");
        }
        this.peerHasMap = hasMap;
    }

    /**
     * The Message proto contains an embedded one-of.  Essentially this will wrap
     * the bundle bytes payload in a wrapper by prefixing a few bytes to it.
     * In theory the "Message" proto could be expanded with some extra meta
     * (e.g. send time) in the future.
     * Note that the bundle is always passed around as bytes and then
     * parsed as needed to avoid losing unknown fields.
     * @param bundleBytes: the bytes corresponding to a bundle
     * @returns a serialized "Message" proto
     */
    private static makeBundleMessage(bundleBytes: Uint8Array): Uint8Array {
        const message = new SyncMessageBuilder();
        message.setBundle(bundleBytes);
        return message.serializeBinary();
    }

    /**
     * Sends a bundle if we've received a greeting and our internal recordkeeping indicates
     * that the peer could use this particular bundle (but ensures that we're not sending
     * bundles that would cause gaps in the peer's chain.)
     * @param bundleBytes The bundle to be sent.
     * @param bundleInfo Meta about the bundle.
     */
    sendIfNeeded(bundle: BundleView) {
        if (this.peerHasMap?.markAsHaving(bundle.info, true)) {
            this.send(AbstractConnection.makeBundleMessage(bundle.bytes));
            if (!this.unacked.has(bundle.info.medallion)) {
                this.unacked.set(bundle.info.medallion, new Map());
            }
            const innerMap = this.unacked.get(bundle.info.medallion);
            const hadUnacked = this.unackedChains > 0;
            if (!innerMap.has(bundle.info.chainStart)) {
                this.unackedChains++;
            }
            innerMap.set(bundle.info.chainStart, bundle.info.timestamp);
            if (!hadUnacked) {
                this.notify();
            }
        }
    }

    onReceivedBundle(bundleInfo: BundleInfo) {
        this.peerHasMap?.markAsHaving(bundleInfo);
        this.sendAck(bundleInfo);
    }

    private sendAck(changeSetInfo: BundleInfo) {
        const ack = new AckBuilder();
        ack.setMedallion(changeSetInfo.medallion);
        ack.setChainStart(changeSetInfo.chainStart);
        ack.setTimestamp(changeSetInfo.timestamp);
        const syncMessageBuilder = new SyncMessageBuilder();
        syncMessageBuilder.setAck(ack);
        const bytes = syncMessageBuilder.serializeBinary();
        this.send(bytes);
    }
}
