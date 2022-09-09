import { Peer } from "./Peer";
import { Store } from "./Store";
import { makeMedallion, assert, extractCommitInfo, info, now } from "./utils";
import { CommitBytes, ClaimedChains, Medallion, ChainStart, Timestamp, Offset, CommitInfo, CommitListener }
    from "./typedefs";
import { SyncMessage } from "sync_message_pb";
import { ChainTracker } from "./ChainTracker";
import { PendingCommit } from "./PendingCommit";
import { Commit as CommitProto } from "commit_pb";

//TODO(https://github.com/google/gink/issues/31): centralize platform dependent code
var W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
    eval("require('websocket').w3cwebsocket");


/**
 * This is an instance of the Gink database that can be run inside of a web browser or via
 * ts-node on a server.  Because of the need to work within a browser it doesn't do any port
 * listening (see Server.ts which extends this class for that capability).
 */
export class GinkInstance {

    initialized: Promise<void>;
    private listeners: CommitListener[] = [];
    private store: Store;
    private countConnections: number = 0; // Includes disconnected clients.
    private claimedChains: ClaimedChains;
    private iHave: ChainTracker;
    readonly peers: Map<number, Peer> = new Map();

    constructor(store: Store) {
        this.store = store;
        this.initialized = this.initialize();
    }

    private async initialize() {
        await this.store.initialized;
        this.claimedChains = await this.store.getClaimedChains();
        this.iHave = await this.store.getChainTracker();
    }


    /**
    * Adds a listener that will be called every time a commit is received with the
    * CommitInfo (which contains chain information, timestamp, and commit comment).
    */
    addListener(listener: CommitListener) {
        this.listeners.push(listener);
    }

    /**
     * Creates an empty commit with only a comment in order to start a chain.
     * @param medallion Medallion to use (only for testing), leave blank in production
     * @param chainStart ChainStart to use (only for testing), leave blank in production
     */
    async startChain(medallion?: Medallion, chainStart?: ChainStart): Promise<[Medallion, ChainStart]> {
        await this.initialized;
        medallion = medallion || makeMedallion();
        chainStart = chainStart || Date.now() * 1000;
        assert(this.iHave.getChains(medallion).length === 0)  // no medallion reuse in 1.x
        assert(chainStart <= Date.now() * 1000) // don't start in the future
        const startCommit = new CommitProto();
        startCommit.setTimestamp(chainStart);
        startCommit.setChainStart(chainStart);
        startCommit.setMedallion(medallion);
        startCommit.setComment("Default Start Chain Comment");
        const startCommitBytes = startCommit.serializeBinary();
        await this.receiveCommit(startCommitBytes);
        await this.store.claimChain(medallion, chainStart);
        this.claimedChains.set(medallion, chainStart);
        return [medallion, chainStart];
    }

    /**
     * Adds a commit to a chain, setting the medallion and timestamps on the commit in the process.
     * 
     * @param pendingCommit a PendingCommit ready to be sealed
     * @param commitInfo optionally explicitly specify the chain and timestamp; intended for deterministic testing
     * @returns A promise that will resolve to the commit timestamp once it's persisted/sent.
     */
    async addCommit(pendingCommit: PendingCommit, commitInfo?: CommitInfo): Promise<CommitInfo> {
        await this.initialized;
        if (!commitInfo) {
            if (!this.claimedChains.size) {
                await this.startChain();
            }
            const chain = this.claimedChains.entries().next().value;
            const seenTo = this.iHave.getSeenTo(chain);
            const nowMicros = Date.now() * 1000;
            assert(seenTo > 0 && seenTo < nowMicros + 500, 
                `seenTo=${seenTo} nowMicros=${nowMicros}`);
            commitInfo = {
                medallion: chain[0],
                chainStart: chain[1],
                timestamp: nowMicros > seenTo ? nowMicros : seenTo + 1,
                priorTime: seenTo,
            }
        }
        const serialized = pendingCommit.seal(commitInfo);
        const resultInfo = await this.receiveCommit(serialized);
        // receiveCommit currently deserializes the commit to get the commit info,
        // which isn't ideal, but we can use it as an opportunity to ensure it's right.
        assert(
            commitInfo.timestamp == resultInfo.timestamp &&
            commitInfo.chainStart == resultInfo.chainStart &&
            commitInfo.medallion == resultInfo.medallion &&
            commitInfo.priorTime == resultInfo.priorTime &&
            commitInfo.comment == resultInfo.comment
            );
        return resultInfo;
    }


    async close() {
        for (const [_peerId, peer] of this.peers) {
            peer.close();
        }
        await this.store.close();
    }

    // returns a truthy number that can be used as a connection id
    createConnectionId(): number {
        return ++this.countConnections;
    }

    /**
     * Tries to add a commit to the local store.  If successful (i.e. it hasn't seen it before)
     * then it will also publish that commit to the connected peers.
     * 
     * @param commitBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns 
     */
    async receiveCommit(commitBytes: CommitBytes, fromConnectionId?: number): Promise<CommitInfo> {
        const commitInfo = extractCommitInfo(commitBytes);
        this.peers.get(fromConnectionId)?.hasMap?.markIfNovel(commitInfo);
        const added = await this.store.addCommit(commitBytes, commitInfo);
        // If this commit isn't new to this instance, then it will have already been 
        // sent to the connected peers and doesn't need to be sent again.
        if (!added) return;
        for (const [peerId, peer] of this.peers) {
            if (peerId != fromConnectionId)
                peer.sendIfNeeded(commitBytes, commitInfo);
        }
        for (const listener of this.listeners) {
            await listener(commitInfo);
        }
        return commitInfo;
    }

    receiveMessage(messageBytes: Uint8Array, fromConnectionId: number) {
        const peer = this.peers.get(fromConnectionId);
        if (!peer) throw Error("Got a message from a peer I don't have a proxy for?")
        try {
            const parsed = SyncMessage.deserializeBinary(messageBytes);
            if (parsed.hasCommit()) {
                const commitBytes: CommitBytes = parsed.getCommit_asU8();
                // TODO: chain these receiveCommit class to ensure they get processed
                // in the order of being received.
                this.receiveCommit(commitBytes, fromConnectionId);
                return;
            }
            if (parsed.hasGreeting()) {
                const greeting = parsed.getGreeting();
                peer.receiveHasMap(new ChainTracker({ greeting }));
                // TODO: figure out how to block processing of receiving other messages while sending
                this.store.getCommits(peer.sendIfNeeded.bind(peer));
                return;
            }
        } catch (e) {
            //TODO: Send some sensible code to the peer to say what went wrong.
            this.peers.get(fromConnectionId)?.close();
            this.peers.delete(fromConnectionId);
        }
    }

    getGreetingMessageBytes(): Uint8Array {
        const greeting = this.iHave.constructGreeting();
        const msg = new SyncMessage();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    async connectTo(target: string): Promise<Peer> {
        await this.initialized;
        const thisClient = this;
        return new Promise<Peer>((resolve, reject) => {
            let opened = false;
            const connectionId = this.createConnectionId();
            const websocketClient: WebSocket = new W3cWebSocket(target, "gink");
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient));
            websocketClient.onopen = function (_ev: Event) {
                info(`opened connection ${connectionId} to ${target}`);
                websocketClient.send(thisClient.getGreetingMessageBytes());
                thisClient.peers.set(connectionId, peer);
                opened = true;
                resolve(peer);
            }
            websocketClient.onerror = function (ev: Event) {
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`)
            }
            websocketClient.onclose = function (ev: CloseEvent) {
                info(`closed connection ${connectionId} to ${target}`);
                if (opened) {
                    thisClient.peers.delete(connectionId);
                } else {
                    reject(ev);
                }
            }
            websocketClient.onmessage = function (ev: MessageEvent) {
                const data = ev.data;
                if (data instanceof ArrayBuffer) {
                    const uint8View = new Uint8Array(data);
                    thisClient.receiveMessage(uint8View, connectionId);
                } else {
                    console.error(`got non-arraybuffer message: ${data}`)
                }
            }
        });
    }
}

