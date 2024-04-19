import { Peer } from "./Peer";
import {
    makeMedallion, ensure, noOp, generateTimestamp, muidToString, builderToMuid,
    encodeToken, getActorId, isAlive,
    getIdentity
} from "./utils";
import { BundleBytes, CommitListener, CallBack, BundleInfo, Muid, Offset, ClaimedChain, } from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Bundler } from "./Bundler";
import { IndexedDbStore } from "./IndexedDbStore";

import { PairSet } from './PairSet';
import { PairMap } from "./PairMap";
import { KeySet } from "./KeySet";
import { Directory } from "./Directory";
import { Box } from "./Box";
import { Sequence } from "./Sequence";
import { Role } from "./Role";
import { Store } from "./Store";
import { Behavior, ChangeBuilder, ContainerBuilder, SyncMessageBuilder } from "./builders";
import { Property } from "./Property";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";
import { BundleBuilder } from "./builders";

/**
 * This is an instance of the Gink database that can be run inside a web browser or via
 * ts-node on a server.  Because of the need to work within a browser it doesn't do any port
 * listening (see GinkListener and GinkServerInstance for that capability).
 */
export class Database {

    ready: Promise<any>;
    readonly peers: Map<number, Peer> = new Map();
    static readonly PROTOCOL = "gink";

    private listeners: Map<string, CommitListener[]> = new Map();
    private countConnections = 0; // Includes disconnected clients.
    private myChain: ClaimedChain;
    private initilized = false;
    protected iHave: ChainTracker;

    //TODO: centralize platform dependent code
    private static W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
        eval("require('websocket').w3cwebsocket");

    constructor(readonly store: Store = new IndexedDbStore('Database-default'),
        identity: string = getIdentity(),
        readonly logger: CallBack = noOp) {
        this.ready = this.initialize(identity);
    }

    private async startChain(identity: string) {
        const medallion = makeMedallion();
        const chainStart = generateTimestamp();
        const bundler = new Bundler(identity, medallion);
        bundler.seal({
            medallion, timestamp: chainStart, chainStart
        });
        const commitBytes = bundler.bytes;
        await this.store.addBundle(commitBytes);
        this.myChain = await this.store.claimChain(medallion, chainStart, getActorId());
        ensure(this.myChain.medallion > 0);
    }

    private async initialize(identity: string): Promise<void> {
        await this.store.ready;
        // TODO(181): make claiming of a chain as needed to facilitate read-only/relay use cases
        const claimedChains = await this.store.getClaimedChains();
        for (let value of claimedChains.values()) {
            if (!(await isAlive(value.actorId)) && await this.store.getChainIdentity([value.medallion, value.chainStart]) == identity) {
                // TODO: check to see if meta-data matches, and overwrite if not
                this.myChain = value;
                if (typeof window != "undefined") {
                    // If we are running in a browser and take over a chain,
                    // start a new heartbeat.
                    setInterval(() => {
                        window.localStorage.setItem(`gink-${value.actorId}`, `${Date.now()}`);
                    }, 1000);
                }
                break;
            }
        }
        if (!this.myChain) {
            await this.startChain(identity);
        }
        ensure(this.myChain.medallion > 0);
        this.iHave = await this.store.getChainTracker();
        this.listeners.set("all", []);
        //this.logger(`Database.ready`);
        const callback = async (bundleBytes: BundleBytes, bundleInfo: BundleInfo): Promise<void> => {
            for (const [peerId, peer] of this.peers) {
                peer._sendIfNeeded(bundleBytes, bundleInfo);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.listeners.get("all")) {
                listener(bundleInfo);
            }
        };
        this.store.addFoundBundleCallBack(callback);
        this.initilized = true;
    }

    /**
     * Returns a handle to the magic global directory.  Primarily intended for testing.
     * @returns a "magic" global directory that always exists and is accessible by all instances
     */
    getGlobalDirectory(): Directory {
        return new Directory(this, { timestamp: -1, medallion: -1, offset: Behavior.DIRECTORY });
    }

    getGlobalProperty(): Property {
        return new Property(this, { timestamp: -1, medallion: -1, offset: Behavior.PROPERTY });
    }

    getMedallionDirectory(): Directory {
        return new Directory(this, { timestamp: -1, medallion: this.myChain[0], offset: Behavior.DIRECTORY });
    }

    /**
     * Creates a new box container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Box container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createBox(change?: Bundler | string): Promise<Box> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.BOX, change);
        return new Box(this, muid, containerBuilder);
    }

    /**
     * Creates a new List container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the List container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createSequence(change?: Bundler | string): Promise<Sequence> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.SEQUENCE, change);
        return new Sequence(this, muid, containerBuilder);
    }

    /**
     * Creates a new Key Set container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Key Set container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createKeySet(change?: Bundler | string): Promise<KeySet> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.KEY_SET, change);
        return new KeySet(this, muid, containerBuilder);
    }

    /**
     * Creates a new Role container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Role container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createRole(change?: Bundler | string): Promise<Role> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.ROLE, change);
        return new Role(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairSet container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairSet container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createPairSet(change?: Bundler | string): Promise<PairSet> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.PAIR_SET, change);
        return new PairSet(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairMap container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairMap container (immediately if a bundler is passed in, otherwise after the commit)
     */
    async createPairMap(change?: Bundler | string): Promise<PairMap> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.PAIR_MAP, change);
        return new PairMap(this, muid, containerBuilder);
    }

    /**
     * Creates a new Directory container (like a javascript map or a python dict).
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Directory container (immediately if a bundler is passed in, otherwise after the commit)
     */
    // TODO: allow user to specify the types allowed for keys and values
    async createDirectory(change?: Bundler | string): Promise<Directory> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.DIRECTORY, change);
        return new Directory(this, muid, containerBuilder);
    }

    async createVertex(change?: Bundler | string): Promise<Vertex> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.VERTEX, change);
        return new Vertex(this, muid, containerBuilder);
    }


    async createEdgeType(change?: Bundler | string): Promise<EdgeType> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.EDGE_TYPE, change);
        return new EdgeType(this, muid, containerBuilder);
    }


    async createProperty(bundlerOrComment?: Bundler | string): Promise<Property> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.PROPERTY, bundlerOrComment);
        return new Property(this, muid, containerBuilder);
    }

    protected async createContainer(behavior: Behavior, change?: Bundler | string): Promise<[Muid, ContainerBuilder]> {
        let immediate = false;
        if (!(change instanceof Bundler)) {
            immediate = true;
            change = new Bundler(change);
        }
        const containerBuilder = new ContainerBuilder();
        containerBuilder.setBehavior(behavior);
        const address = change.addContainer(containerBuilder);
        if (immediate) {
            await this.addBundler(change);
        }
        return [address, containerBuilder];
    }

    /**
     * Useful for interacting with asOf in other
     * Gink functions.
     * @returns now as a number of seconds.
     */
    public getNow(): number {
        return Date.now() * 1000;
    }

    /**
    * Adds a listener that will be called every time a commit is received with the
    * CommitInfo (which contains chain information, timestamp, and commit comment).
    * @param listener a callback to be invoked when a change occurs in the database or container
    * @param containerMuid the Muid of a container to subscribe to. If left out, subscribe to all containers.
    */
    public addListener(listener: CommitListener, containerMuid?: Muid) {
        const key = containerMuid ? muidToString(containerMuid) : "all";
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(listener);
    }

    /**
     * Adds a commit to a chain, setting the medallion and timestamps on the commit in the process.
     *
     * @param bundler a PendingCommit ready to be sealed
     * @returns A promise that will resolve to the commit timestamp once it's persisted/sent.
     */
    public addBundler(bundler: Bundler): Promise<BundleInfo> {
        if (!this.initilized)
            throw new Error("Database not ready");
        if (!(this.myChain.medallion > 0))
            throw new Error("zero medallion?");
        const nowMicros = generateTimestamp();
        const lastBundleInfo = this.iHave.getCommitInfo([this.myChain.medallion, this.myChain.chainStart]);
        const seenThrough = lastBundleInfo.timestamp;
        ensure(seenThrough > 0 && (seenThrough < nowMicros));
        const commitInfo: BundleInfo = {
            medallion: this.myChain.medallion,
            chainStart: this.myChain.chainStart,
            timestamp: seenThrough >= nowMicros ? seenThrough + 10 : nowMicros,
            priorTime: seenThrough,
        };
        bundler.seal(commitInfo);
        this.iHave.markAsHaving(commitInfo);
        // console.log(`sending: ` + JSON.stringify(commitInfo));
        return this.receiveCommit(bundler.bytes);
    }

    /**
     * Closes connections to peers and closes the store.
     */
    public async close() {
        for (const peer of this.peers.values()) {
            try {
                peer.close();
            } catch (problem) {
                console.error(`problem closing peer: ${problem}`);
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
     * This is called both from addPendingCommit (for locally produced commits) and
     * being called by receiveMessage.
     *
     * @param commitBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns
     */
    private receiveCommit(commitBytes: BundleBytes, fromConnectionId?: number): Promise<BundleInfo> {
        return this.store.addBundle(commitBytes).then((bundleInfo) => {
            this.logger(`commit from ${fromConnectionId}: ${JSON.stringify(bundleInfo)}`);
            this.iHave.markAsHaving(bundleInfo);
            const peer = this.peers.get(fromConnectionId);
            if (peer) {
                peer.hasMap?.markAsHaving(bundleInfo);
                peer._sendAck(bundleInfo);
            }
            for (const [peerId, peer] of this.peers) {
                if (peerId != fromConnectionId)
                    peer._sendIfNeeded(commitBytes, bundleInfo);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.listeners.get("all")) {
                listener(bundleInfo);
            }

            // Loop through changes and gather a set of changed containers.
            const changedContainers: Set<string> = new Set();
            const bundleBuilder = <BundleBuilder>BundleBuilder.deserializeBinary(commitBytes);
            const changesMap: Map<Offset, ChangeBuilder> = bundleBuilder.getChangesMap();
            for (const changeBuilder of changesMap.values()) {
                const entry = changeBuilder.getEntry();
                if (entry) {
                    const container = entry.getContainer();
                    if (container.getTimestamp() && container.getMedallion() && container.getOffset()) {
                        const muid = builderToMuid(entry.getContainer());
                        const stringMuid = muidToString(muid);
                        changedContainers.add(stringMuid);
                    }
                }
            }
            // Send to listeners specifically subscribed to each container.
            for (const strMuid of changedContainers) {
                const containerListeners = this.listeners.get(strMuid);
                if (containerListeners) {
                    for (const listener of containerListeners) {
                        listener(bundleInfo);
                    }
                }
            }
            return bundleInfo;
        });
    }

    /**
     * @param messageBytes Bytes received from a peer.
     * @param fromConnectionId Local name of the peer the data was received from.
     * @returns
     */
    protected async receiveMessage(messageBytes: Uint8Array, fromConnectionId: number) {
        await this.ready;
        const peer = this.peers.get(fromConnectionId);
        if (!peer) throw Error("Got a message from a peer I don't have a proxy for?");
        //const unlockingFunction = await this.processingLock.acquireLock();
        try {
            const parsed = <SyncMessageBuilder>SyncMessageBuilder.deserializeBinary(messageBytes);
            if (parsed.hasBundle()) {
                const commitBytes: BundleBytes = parsed.getBundle_asU8();
                await this.receiveCommit(commitBytes, fromConnectionId);
                return;
            }
            if (parsed.hasGreeting()) {
                this.logger(`got greeting from ${fromConnectionId}`);
                const greeting = parsed.getGreeting();
                peer._receiveHasMap(new ChainTracker({ greeting }));
                await this.store.getCommits(peer._sendIfNeeded.bind(peer));
                return;
            }
            if (parsed.hasAck()) {
                const ack = parsed.getAck();
                const info: BundleInfo = {
                    medallion: ack.getMedallion(),
                    timestamp: ack.getTimestamp(),
                    chainStart: ack.getChainStart()
                };
                this.logger(`got ack from ${fromConnectionId}: ${JSON.stringify(info)}`);
                this.peers.get(fromConnectionId)?.hasMap?.markAsHaving(info);
            }
        } catch (e) {
            //TODO: Send some sensible code to the peer to say what went wrong.
            console.error(e);
            this.peers.get(fromConnectionId)?.close();
            this.peers.delete(fromConnectionId);
        } finally {
            //unlockingFunction();
        }
    }

    /**
     * Initiates a websocket connection to a peer.
     * @param target a websocket uri, e.g. "ws://127.0.0.1:8080/"
     * @param onClose optional callback to invoke when the connection is closed
     * @param resolveOnOpen if true, resolve when the connection is established, otherwise wait for greeting
     * @returns a promise to the peer
     */
    public async connectTo(
        target: string,
        options?: {
            onClose?: CallBack,
            resolveOnOpen?: boolean,
            authToken?: string;
        }): Promise<Peer> {
        //TODO(https://github.com/google/gink/issues/69): have the default be to wait for databases to sync
        const onClose: CallBack = (options && options.onClose) ? options.onClose : noOp;
        const resolveOnOpen: boolean = (options && options.resolveOnOpen) ? options.resolveOnOpen : false;
        const authToken: string = (options && options.authToken) ? options.authToken : undefined;

        await this.ready;
        const thisClient = this;
        return new Promise<Peer>((resolve, reject) => {
            let protocols = [Database.PROTOCOL];

            if (authToken) protocols.push(encodeToken(authToken));
            const connectionId = this.createConnectionId();
            let websocketClient: WebSocket = new Database.W3cWebSocket(target, protocols);
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient));

            websocketClient.onopen = function (_ev: Event) {
                // called once the new connection has been established
                websocketClient.send(thisClient.iHave.getGreetingMessageBytes());
                thisClient.peers.set(connectionId, peer);
                if (resolveOnOpen)
                    resolve(peer);
                else
                    peer.ready.then(resolve);
            };
            websocketClient.onerror = function (ev: Event) {
                // if/when this is called depends on the details of the websocket implementation
                console.error(`error on connection ${connectionId} to ${target}, ${ev}`);
            };
            websocketClient.onclose = function (ev: CloseEvent) {
                // this should always be called once the peer disconnects, including in cases of error
                onClose(`closed connection ${connectionId} to ${target}`);

                // If the connection was never successfully established, then
                // reject the promise returned from the outer connectTo.
                reject(ev);

                // I'm intentionally leaving the peer object in the peers map just in case we get data from them.
                // thisClient.peers.delete(connectionId);  // might still be processing data from peer
            };
            websocketClient.onmessage = function (ev: MessageEvent) {
                // Called when any protocol messages are received.
                const data = ev.data;
                if (data instanceof ArrayBuffer) {
                    const uint8View = new Uint8Array(data);
                    thisClient.receiveMessage(uint8View, connectionId);
                } else {
                    // We don't expect any non-binary text messages.
                    console.error(`got non-arraybuffer message: ${data}`);
                }
            };
        });
    }
}
