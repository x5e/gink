var W3cWebSocket = typeof WebSocket == 'function' ? WebSocket : 
    eval("require('websocket').w3cwebsocket");
import { GinkPeer } from "./GinkPeer";
import { GinkStore } from "./GinkStore";
import { makeHasMap } from "./utils";
import { GreetingBytes, HasMap } from "./typedefs";

export class GinkBus {

    initialized: Promise<void>;
    #ginkStore: GinkStore;
    #iHave: HasMap;
    #nextId: number = 0;
    readonly peers: Map<number, GinkPeer> = new Map();
    
    constructor(ginkStore: GinkStore) {
        this.#ginkStore = ginkStore;
        this.initialized = this.#initialize();
    }

    async #initialize() {
        await this.#ginkStore.initialized;
        this.#iHave = await this.#ginkStore.getHasMap();  
    }

    async receiveCommit() {

    }

    getGreetingMessage(): Uint8Array {
        this.#iHave.size;
        throw new Error("not implemented");
    }

    async connectTo(target: string) {
        await this.initialized;
        const bus = this;
        return new Promise<GinkPeer>((resolve, reject) => {
            let opened = false;
            let connectionId = this.#nextId++;
            const websocketClient: WebSocket = new W3cWebSocket(target, "gink");
            websocketClient.onopen = function(_ev: Event) {
                console.log(`opened connection ${connectionId} to ${target}`);
                websocketClient.send(bus.getGreetingMessage());
                const peer = new GinkPeer(websocketClient);
                bus.peers.set(connectionId, peer);
                opened = true;
                resolve(peer);
            }
            websocketClient.onerror = function(ev: Event) {
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`)
            }
            websocketClient.onclose = function(ev: CloseEvent) {
                console.log(`closed connection ${connectionId} to ${target}`);
                if (opened) {
                    bus.peers.delete(connectionId);
                } else {
                    reject(ev);
                }
            }
        });
    }
}