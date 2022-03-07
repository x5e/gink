var W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
    eval("require('websocket').w3cwebsocket");
import { Peer } from "./Peer";
import { Store } from "./Store";
import { makeHasMap, hasMapToGreeting } from "./utils";
import { HasMap, CommitBytes, CommitInfo } from "./typedefs";
import { Message } from "messages_pb";


export class Client {

    initialized: Promise<void>;
    #store: Store;
    #iHave: HasMap;
    #countConnections: number = 0; // Includes disconnected clients.
    readonly peers: Map<number, Peer> = new Map();

    constructor(store: Store) {
        this.#store = store;
        this.initialized = this.#initialize();
    }

    async close() {
        for (const [_peerId, peer] of this.peers) {
            peer.close();
        }
        await this.#store.close();
    }

    async #initialize() {
        await this.#store.initialized;
        this.#iHave = await this.#store.getHasMap();
    }

    // returns a truthy number that can be used as a connection id
    createConnectionId(): number {
        return ++this.#countConnections;
    }

    /**
     * 
     * @param commitBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns 
     */
    async receiveCommit(fromConnectionId: number|null, commitBytes: CommitBytes) {
        let commitInfo: CommitInfo|null = await this.#store.addCommit(commitBytes, this.#iHave);
        if (!commitInfo) return; // commitInfo will be falsey if already had this commit
        this.peers.get(fromConnectionId)?.markReceived(commitInfo);
        for (const [peerId, peer] of this.peers) {
            if (peerId != fromConnectionId)
                peer.sendIfNeeded(commitBytes, commitInfo);
        }
    }

    receiveMessage(fromConnectionId: number, messageBytes: Uint8Array) {
        try {
            const parsed = Message.deserializeBinary(messageBytes);
            if (parsed.hasCommit()) {
                const commitBytes: CommitBytes = parsed.getCommit_asU8();
                this.receiveCommit(fromConnectionId, commitBytes);
                return;
            }
            if (parsed.hasGreeting()) {
                const greeting = parsed.getGreeting();
                const hasMap = makeHasMap({ greeting });
                this.peers.get(fromConnectionId)?.receiveHasMap(hasMap);
                return;
            }
        } catch (e) {
            //TODO: Send some sensible code to say what went wrong.
            this.peers.get(fromConnectionId)?.close();
            this.peers.delete(fromConnectionId);
        }   
    }

    getGreetingMessageBytes(): Uint8Array {
        const greeting = hasMapToGreeting(this.#iHave);
        const msg = new Message();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    async connectTo(target: string): Promise<Peer> {
        await this.initialized;
        const bus = this;
        return new Promise<Peer>((resolve, reject) => {
            let opened = false;
            const connectionId = this.createConnectionId();
            const websocketClient: WebSocket = new W3cWebSocket(target, "gink");
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient), 
                websocketClient.close.bind(websocketClient));
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
                    const uint8View = new Uint8Array(data);
                    bus.receiveMessage(connectionId, uint8View);
                } else {
                    console.error(`got non-arraybuffer message: ${data}`)
                }
            }
        });
    }
}