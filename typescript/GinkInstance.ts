import { Peer } from "./Peer";
import { Store } from "./Store";
import { makeMedallion, assert, extractCommitInfo, noOp } from "./utils";
import { CommitBytes, Medallion, ChainStart, CommitInfo, CommitListener, CallBack }
    from "./typedefs";
import { SyncMessage } from "sync_message_pb";
import { ChainTracker } from "./ChainTracker";
import { PendingCommit } from "./PendingCommit";
import { Commit as CommitProto } from "commit_pb";
import { PromiseChainLock } from "./PromiseChainLock";

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
    readonly peers: Map<number, Peer> = new Map();

    private listeners: CommitListener[] = [];
    private store: Store;
    private countConnections: number = 0; // Includes disconnected clients.
    private myChain: [Medallion, ChainStart];
    private promiseChainLock = new PromiseChainLock();
    private iHave: ChainTracker;

    constructor(store: Store, clientInfo: string = "Default Start Chain Comment") {
        this.store = store;
        this.initialized = this.initialize(clientInfo);
    }

    private async initialize(clientInfo: string) {
        await this.store.initialized;
        const claimedChains = await this.store.getClaimedChains();
        if (claimedChains.size) {
            this.myChain = claimedChains.entries().next().value;
        } else {
            this.myChain = await this.startChain(clientInfo);
        }
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
     * Creates an empty commit with only a comment in order to start a chain,
     * called from initialize so don't wait on initialize !
     */
    private async startChain(comment: string): Promise<[Medallion, ChainStart]> {
        const medallion = makeMedallion();
        const chainStart = Date.now() * 1000;
        const startCommit = new CommitProto();
        startCommit.setTimestamp(chainStart);
        startCommit.setChainStart(chainStart);
        startCommit.setMedallion(medallion);
        startCommit.setComment(comment);
        const commitBytes = startCommit.serializeBinary();
        const commitInfo: CommitInfo = {medallion, chainStart, timestamp: chainStart, comment}
        await this.store.addCommit(commitBytes, commitInfo);
        await this.store.claimChain(medallion, chainStart);
        return [medallion, chainStart];
    }

    /**
     * Adds a commit to a chain, setting the medallion and timestamps on the commit in the process.
     * 
     * @param pendingCommit a PendingCommit ready to be sealed
     * @returns A promise that will resolve to the commit timestamp once it's persisted/sent.
     */
    async addCommit(pendingCommit: PendingCommit): Promise<CommitInfo> {
        await this.initialized;
        var unlockingFunction: CallBack;
        var resultInfo: CommitInfo;
        try {
            unlockingFunction = await this.promiseChainLock.acquireLock();
            const nowMicros = Date.now() * 1000;
            const seenThrough = await this.store.getSeenThrough(this.myChain);
            assert(seenThrough > 0 && (seenThrough < nowMicros + 500));
            const commitInfo: CommitInfo = {
                medallion: this.myChain[0],
                chainStart: this.myChain[1],
                timestamp: seenThrough >= nowMicros ? seenThrough + 1 : nowMicros,
                priorTime: seenThrough,
            }
            const serialized = pendingCommit.seal(commitInfo);
            resultInfo = await this.receiveCommit(serialized);
            // receiveCommit currently deserializes the commit to get the commit info,
            // which isn't ideal, but we can use it as an opportunity to ensure it's right.
            assert(
                commitInfo.timestamp == resultInfo.timestamp &&
                commitInfo.chainStart == resultInfo.chainStart &&
                commitInfo.medallion == resultInfo.medallion &&
                commitInfo.priorTime == resultInfo.priorTime &&
                commitInfo.comment == resultInfo.comment
                );
        } finally {
            unlockingFunction("this string is ignored");
        } 
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
        await this.initialized;
        const commitInfo = extractCommitInfo(commitBytes);
        this.peers.get(fromConnectionId)?.hasMap?.markIfNovel(commitInfo);
        const added = await this.store.addCommit(commitBytes, commitInfo);
        this.iHave.markIfNovel(commitInfo);
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

    async connectTo(target: string, onOpen: CallBack = noOp, onClose: CallBack = noOp): Promise<Peer> {
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
                onOpen(`opened connection ${connectionId} to ${target}`);
                websocketClient.send(thisClient.getGreetingMessageBytes());
                thisClient.peers.set(connectionId, peer);
                opened = true;
                resolve(peer);
            }
            websocketClient.onerror = function (ev: Event) {
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`)
            }
            websocketClient.onclose = function (ev: CloseEvent) {
                onClose(`closed connection ${connectionId} to ${target}`);
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

