var W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
    eval("require('websocket').w3cwebsocket");
import { GinkPeer } from "./GinkPeer";
import { GinkStore } from "./GinkStore";
import { makeHasMap, hasMapToGreeting } from "./utils";
import { HasMap, GinkTrxnBytes, CommitInfo } from "./typedefs";
import { Message as GinkMessage } from "messages_pb";
import { Message } from "google-protobuf";

export class GinkBus {

    initialized: Promise<void>;
    #ginkStore: GinkStore;
    #iHave: HasMap;
    #countClientsEverConnected: number = 0; // Includes disconnected clients.
    readonly peers: Map<number, GinkPeer> = new Map();

    constructor(ginkStore: GinkStore) {
        this.#ginkStore = ginkStore;
        this.initialized = this.#initialize();
    }

    async #initialize() {
        await this.#ginkStore.initialized;
        this.#iHave = await this.#ginkStore.getHasMap();
    }

    /**
     * 
     * @param trxnBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns 
     */
    async receiveCommit(trxnBytes: GinkTrxnBytes, fromConnectionId?: number) {
        let commitInfo: CommitInfo;
        try {
            commitInfo = await this.#ginkStore.addTransaction(trxnBytes, this.#iHave);
        } catch (e) {
            //TODO: Send some sensible code to say what went wrong.
            this.peers.get(fromConnectionId)?.webSocket.close();
            this.peers.delete(fromConnectionId);
        }
        if (!commitInfo) return; // commitInfo will be falsey if already had this commit
        this.peers.get(fromConnectionId)?.markReceived(commitInfo);
        for (const [peerId, ginkPeer] of this.peers) {
            if (peerId != fromConnectionId)
                ginkPeer.sendToPeerIfNeeded(trxnBytes, commitInfo);
        }
    }

    getGreetingMessageBytes(): Uint8Array {
        const greeting = hasMapToGreeting(this.#iHave);
        const msg = new GinkMessage();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    async connectTo(target: string) {
        await this.initialized;
        const bus = this;
        return new Promise<GinkPeer>((resolve, reject) => {
            let opened = false;
            // All connectionIds will be > 0 due to the pre-increment.
            let connectionId = ++this.#countClientsEverConnected;
            const websocketClient: WebSocket = new W3cWebSocket(target, "gink");
            const peer = new GinkPeer(websocketClient);
            websocketClient.binaryType = "arraybuffer";
            websocketClient.onopen = function (_ev: Event) {
                console.log(`opened connection ${connectionId} to ${target}`);
                websocketClient.send(bus.getGreetingMessageBytes());
                bus.peers.set(connectionId, peer);
                opened = true;
                resolve(peer);
            }
            websocketClient.onerror = function (ev: Event) {
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`)
            }
            websocketClient.onclose = function (ev: CloseEvent) {
                console.log(`closed connection ${connectionId} to ${target}`);
                if (opened) {
                    bus.peers.delete(connectionId);
                } else {
                    reject(ev);
                }
            }
            websocketClient.onmessage = function (ev: MessageEvent) {
                const data = ev.data;
                if (data instanceof ArrayBuffer) {
                    const parsed = GinkMessage.deserializeBinary(new Uint8Array(data));
                    if (parsed.hasTransaction()) {
                        const trxnBytes: GinkTrxnBytes = parsed.getTransaction_asU8();
                        bus.receiveCommit(trxnBytes, connectionId);
                        return;
                    }
                    if (parsed.hasGreeting()) {
                        const greeting = parsed.getGreeting();
                        const hasMap = makeHasMap({ greeting })
                    }
                }
            }
        });
    }
}