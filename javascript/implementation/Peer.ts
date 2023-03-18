import { BundleInfo, BundleBytes, CallBack } from "./typedefs";
import { noOp, ensure } from "./utils";
import { ChainTracker } from "./ChainTracker";
import { SyncMessage as SyncMessageBuilder } from "../builders/sync_message_pb";


export class Peer {
    private sendFunc: (msg: Uint8Array) => void;
    private closeFunc: () => void;
    private callWhenReady: CallBack;
    private callOnTimeout: CallBack;
    hasMap?: ChainTracker;
    ready: Promise<Peer>;

    constructor(sendFunc: (msg: Uint8Array) => void, closeFunc: () => void = noOp) {
        this.sendFunc = sendFunc;
        this.closeFunc = closeFunc;
        const thisPeer = this;
        this.ready = new Promise((resolve, reject) => {
            thisPeer.callWhenReady = resolve;
            thisPeer.callOnTimeout = reject;
        });
        setTimeout(()=>{thisPeer.callOnTimeout();}, 1000);
    }

    close() {
        const func = this.closeFunc;
        func();
        this.sendFunc = noOp;
        this.hasMap = undefined;
    }

    _receiveHasMap(hasMap: ChainTracker) {
        ensure(!this.hasMap, "Already received a HasMap/Greeting from this Peer!");
        this.hasMap = hasMap;
        this.callWhenReady(this);
    }

    /**
     * The Message proto contains an embedded oneof.  Essentially this will wrap
     * the commit bytes payload in a wrapper by prefixing a few bytes to it.
     * In theory the "Message" proto could be expanded with some extra metadata
     * (e.g. send time) in the future.
     * Note that the commit is always passed around as bytes and then
     * re-parsed as needed to avoid losing unknown fields.
     * @param bundleBytes: the bytes corresponding to a commit
     * @returns a serialized "Message" proto
     */
    private static makeCommitMessage(bundleBytes: Uint8Array): Uint8Array {
        const message = new SyncMessageBuilder();
        message.setBundle(bundleBytes);
        const msgBytes = message.serializeBinary();
        return msgBytes;
    }

    /**
     * Sends a commit if we've received a greeting and our internal recordkeeping indicates
     * that the peer could use this particular commit (but ensures that we're not sending
     * commits that would cause gaps in the peer's chain.)
     * @param bundleBytes The commit to be sent.
     * @param bundleInfo Metadata about the commit.
     */
    _sendIfNeeded(bundleBytes: BundleBytes, bundleInfo: BundleInfo) {
        if (this.hasMap?.markAsHaving(bundleInfo, true)) {
            this.sendFunc(Peer.makeCommitMessage(bundleBytes));
        }
    }

    _sendAck(changeSetInfo: BundleInfo) {
        const ack = new SyncMessageBuilder.Ack();
        ack.setMedallion(changeSetInfo.medallion);
        ack.setChainStart(changeSetInfo.chainStart);
        ack.setTimestamp(changeSetInfo.timestamp);
        const syncMessageBuilder = new SyncMessageBuilder();
        syncMessageBuilder.setAck(ack);
        const bytes = syncMessageBuilder.serializeBinary();
        this.sendFunc(bytes);
    }
}
