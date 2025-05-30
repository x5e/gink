import { BundleInfo, BundleView, CallBack, ConnectionState } from "./typedefs";
import { ensure, noOp } from "./utils";
import { HasMap } from "./HasMap";
import { AckBuilder, SyncMessageBuilder } from "./builders";

export class AbstractConnection {
    private callWhenReady: CallBack;
    private callOnTimeout: CallBack;
    protected listeners: Array<(state: ConnectionState) => void> = [];
    protected state: ConnectionState = "connecting";
    hasMap?: HasMap;
    ready: Promise<AbstractConnection>;

    constructor() {
        const thisPeer = this;
        this.ready = new Promise((resolve, reject) => {
            thisPeer.callWhenReady = resolve;
            thisPeer.callOnTimeout = reject;
        });
        setTimeout(() => {
            thisPeer.callOnTimeout();
        }, 1000);
    }

    protected setState(state: ConnectionState) {
        this.state = state;
        this.listeners.forEach(listener => listener(state));
    }

    subscribe(callback: (state: ConnectionState) => void): () => void {
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


    receiveHasMap(hasMap: HasMap) {
        ensure(
            !this.hasMap,
            "Already received a HasMap/Greeting from this Peer!",
        );
        this.hasMap = hasMap;
        this.callWhenReady(this);
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
        if (this.hasMap?.markAsHaving(bundle.info, true)) {
            this.send(AbstractConnection.makeBundleMessage(bundle.bytes));
        }
    }

    sendAck(changeSetInfo: BundleInfo) {
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
