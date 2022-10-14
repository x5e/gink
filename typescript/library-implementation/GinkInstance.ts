import { Peer } from "./Peer";
import { makeMedallion, ensure, noOp } from "./utils";
import { ChangeSetBytes, Medallion, ChainStart, CommitListener, CallBack } from "./typedefs";
import { ChangeSetInfo, Muid } from "./typedefs";
import { SyncMessage } from "sync_message_pb";
import { ChainTracker } from "./ChainTracker";
import { ChangeSet } from "./ChangeSet";
import { ChangeSet as ChangeSetMessage } from "change_set_pb";
import { PromiseChainLock } from "./PromiseChainLock";
import { IndexedDbStore } from "./IndexedDbStore";
import { Container as ContainerBuilder } from "container_pb";
import { Directory } from "./Directory";
import { Box } from "./Box";
import { List } from "./List";
import { Store } from "./Store";


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
    private countConnections: number = 0; // Includes disconnected clients.
    private myChain: [Medallion, ChainStart];
    private processingLock = new PromiseChainLock();
    protected iHave: ChainTracker;
    protected myStore: Store;

    //TODO(https://github.com/google/gink/issues/31): centralize platform dependent code
    private static W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
    eval("require('websocket').w3cwebsocket");

    constructor(store?: Store, instanceInfo: string = "Default instanceInfo") {
        this.myStore = store || new IndexedDbStore();
        this.initialized = this.initialize(instanceInfo);
    }

    get store(): Store {
        return this.myStore;
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

    get root(): Directory {
        return new Directory(this);
    }

    async createBox(changeSet?: ChangeSet): Promise<Box> {
        const [muid, containerBuilder] = await this.createContainer(ContainerBuilder.Behavior.BOX, changeSet);
        return new Box(this, muid, containerBuilder);
    }

    async createList(changeSet?: ChangeSet): Promise<List> {
        const [muid, containerBuilder] = await this.createContainer(ContainerBuilder.Behavior.BOX, changeSet);
        return new List(this, muid, containerBuilder);
    }

    // TODO: allow user to specify the types allowed for keys and values
    async createDirectory(changeSet?: ChangeSet): Promise<Directory> {
        const [muid, containerBuilder] = await this.createContainer(ContainerBuilder.Behavior.SCHEMA, changeSet);
        return new Directory(this, muid, containerBuilder);
    }

    protected async createContainer(behavior: ContainerBuilder.Behavior, changeSet?: ChangeSet): Promise<[Muid, ContainerBuilder]> {
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }
        const containerBuilder = new ContainerBuilder();
        containerBuilder.setBehavior(behavior);
        const address = changeSet.addContainer(containerBuilder);
        if (immediate) {
            await this.addChangeSet(changeSet);
        }
        return [address, containerBuilder];
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
    public async addChangeSet(changeSet: ChangeSet): Promise<ChangeSetInfo> {
        var unlockingFunction: CallBack;
        var resultInfo: ChangeSetInfo;
        try {
            unlockingFunction = await this.processingLock.acquireLock();
            await this.initialized;
            const nowMicros = Date.now() * 1000;
            const seenThrough = await this.store.getSeenThrough(this.myChain);
            ensure(seenThrough > 0 && (seenThrough < nowMicros + 500));
            const commitInfo: ChangeSetInfo = {
                medallion: this.myChain[0],
                chainStart: this.myChain[1],
                timestamp: seenThrough >= nowMicros ? seenThrough + 1 : nowMicros,
                priorTime: seenThrough,
            }
            resultInfo = changeSet.seal(commitInfo);
            await this.receiveCommit(changeSet.bytes);
        } finally {
            unlockingFunction("this string is ignored");
        }
        return resultInfo;
    }

    /**
     * Closes connections to peers and closes the store.
     */
    public async close() {
        for (const peer of this.peers.values()) {
            try {
                peer.close();
            } catch (problem) {
                console.error(`problem closing peer: ${problem}`)
            }
        }
        await this.store.close();
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
    private async receiveCommit(commitBytes: ChangeSetBytes, fromConnectionId?: number): Promise<void> {
        await this.initialized;
        const changeSetInfo = await this.store.addChangeSet(commitBytes);
        if (!changeSetInfo) return;
        this.peers.get(fromConnectionId)?.hasMap?.markIfNovel(changeSetInfo);
        this.iHave.markIfNovel(changeSetInfo);
        for (const [peerId, peer] of this.peers) {
            if (peerId != fromConnectionId)
                peer.sendIfNeeded(commitBytes, changeSetInfo);
        }
        for (const listener of this.listeners) {
            await listener(changeSetInfo);
        }
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
                const commitBytes: ChangeSetBytes = parsed.getCommit_asU8();
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
            const websocketClient: WebSocket = new GinkInstance.W3cWebSocket(target, GinkInstance.PROTOCOL);
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient));
            websocketClient.onopen = function (_ev: Event) {
                // called once the new connection has been established
                websocketClient.send(thisClient.iHave.getGreetingMessageBytes());
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
