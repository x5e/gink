import { Peer } from "./Peer";
import { Store } from "./Store";
import { makeMedallion, assert, extractCommitInfo, noOp } from "./utils";
import { CommitBytes, Medallion, ChainStart, CommitInfo, CommitListener, CallBack } from "./typedefs";
import { SyncMessage } from "sync_message_pb";
import { ChainTracker } from "./ChainTracker";
import { ChangeSet } from "./ChangeSet";
import { ChangeSet as ChangeSetMessage } from "change_set_pb";
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
    static readonly PROTOCOL = "gink";

    private listeners: CommitListener[] = [];
    private store: Store;
    private countConnections: number = 0; // Includes disconnected clients.
    private myChain: [Medallion, ChainStart];
    private processingLock = new PromiseChainLock();
    private iHave: ChainTracker;

    constructor(store: Store, instanceInfo: string = "Default instanceInfo") {
        this.store = store;
        this.initialized = this.initialize(instanceInfo);
    }

    private async initialize(instanceInfo: string) {
        await this.store.initialized;
        const claimedChains = await this.store.getClaimedChains();
        if (claimedChains.size) {
            this.myChain = claimedChains.entries().next().value;
        } else {
            this.myChain = await this.startChain(instanceInfo);
        }
        this.iHave = await this.store.getChainTracker();
    }

    /**
    * Adds a listener that will be called every time a commit is received with the
    * CommitInfo (which contains chain information, timestamp, and commit comment).
    */
    public addListener(listener: CommitListener) {
        this.listeners.push(listener);
    }

    /**
     * Creates an empty commit with only a comment in order to start a chain,
     * called from initialize so don't wait on initialize !
     */
    private async startChain(comment: string): Promise<[Medallion, ChainStart]> {
        const medallion = makeMedallion();
        const chainStart = Date.now() * 1000;
        const startCommit = new ChangeSetMessage();
        startCommit.setTimestamp(chainStart);
        startCommit.setChainStart(chainStart);
        startCommit.setMedallion(medallion);
        startCommit.setComment(comment);
        const commitBytes = startCommit.serializeBinary();
        await this.store.addChangeSet(commitBytes);
        await this.store.claimChain(medallion, chainStart);
        return [medallion, chainStart];
    }

    /**
     * Adds a commit to a chain, setting the medallion and timestamps on the commit in the process.
     * 
     * @param changeSet a PendingCommit ready to be sealed
     * @returns A promise that will resolve to the commit timestamp once it's persisted/sent.
     */
    public async addChangeSet(changeSet: ChangeSet): Promise<CommitInfo> {
        var unlockingFunction: CallBack;
        var resultInfo: CommitInfo;
        try {
            unlockingFunction = await this.processingLock.acquireLock();
            await this.initialized;
            const nowMicros = Date.now() * 1000;
            const seenThrough = await this.store.getSeenThrough(this.myChain);
            assert(seenThrough > 0 && (seenThrough < nowMicros + 500));
            const commitInfo: CommitInfo = {
                medallion: this.myChain[0],
                chainStart: this.myChain[1],
                timestamp: seenThrough >= nowMicros ? seenThrough + 1 : nowMicros,
                priorTime: seenThrough,
            }
            const serialized = changeSet.seal(commitInfo);
            resultInfo = await this.receiveCommit(serialized);
            // receiveCommit currently deserializes the commit to get the commit info,
            // which isn't ideal, but we can use it as an opportunity to ensure it's right.
            assert(
                commitInfo.timestamp == resultInfo.timestamp &&
                commitInfo.chainStart == resultInfo.chainStart &&
                commitInfo.medallion == resultInfo.medallion &&
                commitInfo.priorTime == resultInfo.priorTime
            );
        } finally {
            unlockingFunction("this string is ignored");
        }
        return resultInfo;
    }

    /**
     * Closes connections to peers and closes the store.
     */
    public async close() {
        try {
            for (const peer of this.peers.values()) {
                peer.close();
            }
            await this.store.close();
        } catch (problem) {
            console.error(`problem in GinkInstance.close: ${problem}`)
        }
    }

    /**
     * @returns a truthy number that can be used to identify connections
     */
    protected createConnectionId(): number {
        return ++this.countConnections;
    }

    /**
     * Tries to add a commit to the local store.  If successful (i.e. it hasn't seen it before)
     * then it will also publish that commit to the connected peers.
     * 
     * This is called both from addPendingCommit (for locally produced commits) as well as
     * being called by receiveMessage.
     * 
     * @param commitBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns 
     */
    private async receiveCommit(commitBytes: CommitBytes, fromConnectionId?: number): Promise<CommitInfo> {
        await this.initialized;
        const commitInfo = extractCommitInfo(commitBytes);
        this.peers.get(fromConnectionId)?.hasMap?.markIfNovel(commitInfo);
        if (await this.store.addChangeSet(commitBytes)) {
            this.iHave.markIfNovel(commitInfo);
            for (const [peerId, peer] of this.peers) {
                if (peerId != fromConnectionId)
                    peer.sendIfNeeded(commitBytes, commitInfo);
            }
            for (const listener of this.listeners) {
                await listener(commitInfo);
            }
        }
        return commitInfo;
    }

    /**
     * @param messageBytes Bytes received from a peer.
     * @param fromConnectionId Local name of the peer the data was received from.
     * @returns 
     */
    protected async receiveMessage(messageBytes: Uint8Array, fromConnectionId: number) {
        const peer = this.peers.get(fromConnectionId);
        if (!peer) throw Error("Got a message from a peer I don't have a proxy for?")
        let unlockingFunction: CallBack;
        try {
            unlockingFunction = await this.processingLock.acquireLock();
            const parsed = SyncMessage.deserializeBinary(messageBytes);
            if (parsed.hasCommit()) {
                const commitBytes: CommitBytes = parsed.getCommit_asU8();
                await this.receiveCommit(commitBytes, fromConnectionId);
                return;
            }
            if (parsed.hasGreeting()) {
                const greeting = parsed.getGreeting();
                peer.receiveHasMap(new ChainTracker({ greeting }));
                await this.store.getCommits(peer.sendIfNeeded.bind(peer));
                return;
            }
        } catch (e) {
            //TODO: Send some sensible code to the peer to say what went wrong.
            this.peers.get(fromConnectionId)?.close();
            this.peers.delete(fromConnectionId);
        } finally {
            unlockingFunction("ignored string");
        }
    }

    /**
     * @returns bytes that can be sent during the initial handshake
     */
    protected getGreetingMessageBytes(): Uint8Array {
        const greeting = this.iHave.constructGreeting();
        const msg = new SyncMessage();
        msg.setGreeting(greeting);
        return msg.serializeBinary();
    }

    /**
     * Initiates a websocket connection to a peer.
     * @param target a websocket uri, e.g. "ws://127.0.0.1:8080/"
     * @param onClose optional callback to invoke when the connection is closed
     * @returns a promise that's resolved once the connection has been established
     */
    public async connectTo(target: string, onClose: CallBack = noOp): Promise<Peer> {
        await this.initialized;
        const thisClient = this;
        return new Promise<Peer>((resolve, reject) => {
            let opened = false;
            const connectionId = this.createConnectionId();
            const websocketClient: WebSocket = new W3cWebSocket(target, GinkInstance.PROTOCOL);
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient));
            websocketClient.onopen = function (_ev: Event) {
                // called once the new connection has been established
                websocketClient.send(thisClient.getGreetingMessageBytes());
                thisClient.peers.set(connectionId, peer);
                opened = true;
                resolve(peer);
            }
            websocketClient.onerror = function (ev: Event) {
                // if/when this is called depends on the details of the websocket implementation
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`)
            }
            websocketClient.onclose = function (ev: CloseEvent) {
                // this should always be called once the peer disconnects, including in cases of error
                onClose(`closed connection ${connectionId} to ${target}`);
                if (opened) {
                    thisClient.peers.delete(connectionId);
                } else {
                    // If the connection was never successfully established, then 
                    // reject the promise returned from the outer connectTo.
                    reject(ev);
                }
            }
            websocketClient.onmessage = function (ev: MessageEvent) {
                // Called when any protocol messages are received.
                const data = ev.data;
                if (data instanceof ArrayBuffer) {
                    const uint8View = new Uint8Array(data);
                    thisClient.receiveMessage(uint8View, connectionId);
                } else {
                    // We don't expect any non-binary text messages.
                    console.error(`got non-arraybuffer message: ${data}`)
                }
            }
        });
    }
}
