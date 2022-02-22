import { HasMap, CommitInfo, GinkTrxnBytes } from "./typedefs";
import { makeCommitMessage } from "./utils";

export class GinkPeer {
    readonly webSocket: WebSocket;
    hasMap?: HasMap;

    constructor(webSocket: WebSocket) { 
        this.webSocket = webSocket;
    }

    markReceived(commitInfo: CommitInfo) {
        const [timestamp, medallion, chainStart, _priorTime] = commitInfo;
        if (this.hasMap) {
            let medallionMap = this.hasMap.get(medallion);
            if (!medallionMap) {
                medallionMap = new Map();
                this.hasMap.set(medallion, medallionMap);
            }
            medallionMap.set(chainStart, timestamp);
        }
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
        this.webSocket.send(makeCommitMessage(commitBytes));
        if (!medallionMap) {
            medallionMap = new Map();
            this.hasMap.set(medallion, medallionMap);
        }
        medallionMap.set(chainStart, timestamp);
    }
}