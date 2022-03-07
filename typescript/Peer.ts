import { assert } from "console";
import { HasMap, CommitInfo, CommitBytes } from "./typedefs";
import { makeCommitMessage, noOp } from "./utils";

export class Peer {
    #sendFunc: (msg: Uint8Array) => void;
    #closeFunc: () => void;
    #hasMap?: HasMap;

    constructor(sendFunc: (msg: Uint8Array) => void, closeFunc: () => void = noOp) { 
        this.#sendFunc = sendFunc;
        this.#closeFunc = closeFunc;
    }

    close() {
        var func = this.#closeFunc;
        func();
    }

    receiveHasMap(hasMap: HasMap) {
        assert(!this.#hasMap);
        this.#hasMap = hasMap;
    }

    markReceived(commitInfo: CommitInfo) {
        const [timestamp, medallion, chainStart, _priorTime] = commitInfo;
        if (this.#hasMap) {
            let medallionMap = this.#hasMap.get(medallion);
            if (!medallionMap) {
                medallionMap = new Map();
                this.#hasMap.set(medallion, medallionMap);
            }
            medallionMap.set(chainStart, timestamp);
        }
    }

    sendIfNeeded(commitBytes: CommitBytes, commitInfo: CommitInfo) {
        // Determine if it would be appropriate to send this commit to the peer.
        if (!this.#hasMap) {
            // We haven't got a greeting from the peer yet, so don't send anything.
            return;
        }
        const [timestamp, medallion, chainStart, priorTime] = commitInfo;
        let hasMapForMedallion = this.#hasMap.get(medallion);
        const hasThroughForChain = hasMapForMedallion?.get(chainStart);
        if (hasThroughForChain >= timestamp) {
            // Peer has already got this commit, so there's no need to send it.
            return;
        }
        if (timestamp != chainStart && hasThroughForChain != priorTime) {
            // Not sure if this should ever happen.
            console.error(`Cannot extend a peers chain for ${medallion}, ${chainStart}`);
            return;
        }

        // Okay, send the message.
        this.#sendFunc(makeCommitMessage(commitBytes));

        // Now note that the peer possesses the sent commit in the corresponding chain.
        if (!hasMapForMedallion) {
            hasMapForMedallion = new Map();
            this.#hasMap.set(medallion, hasMapForMedallion);
        }
        hasMapForMedallion.set(chainStart, timestamp);
    }
}