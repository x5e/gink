import { HasMap, CommitInfo, GinkTrxnBytes } from "./typedefs";
import { Message as GinkMessage } from "messages_pb";

export class GinkPeer {
    readonly webSocket: WebSocket;
    hasMap?: HasMap;

    constructor(webSocket: WebSocket) { 
        this.webSocket = webSocket;
    }

    sendToPeer(commitBytes: GinkTrxnBytes, commitInfo: CommitInfo) {
        const [timestamp, medallion, chainStart, priorTime] = commitInfo;
        if (!this.hasMap) {
            // We haven't got a greeting from the peer yet, so don't send anything.
            return;
        }
        let medallionMap = this.hasMap.get(medallion);
        const hasThrough = medallionMap?.get(chainStart);
        if (hasThrough >= timestamp) {
            // Already have seen this, so don't need to send.
            return;
        }
        if (timestamp != chainStart && hasThrough != priorTime) {
            // We're missing at least one link.
            return;
        }
        const ginkMessage = new GinkMessage();
        ginkMessage.setTransaction(commitBytes);
        this.webSocket.send(ginkMessage.serializeBinary());
        if (!medallionMap) {
            medallionMap = new Map();
            this.hasMap.set(medallion, medallionMap);
        }
        medallionMap.set(chainStart, timestamp);
    }
}