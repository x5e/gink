import { Peer } from "./Peer";
import {
    makeMedallion, ensure, noOp, generateTimestamp, muidToString, builderToMuid,
    encodeToken, isAlive,
    getIdentity
} from "./utils";
import { BundleBytes, BundleListener, CallBack, BundleInfo, Muid, Offset, ClaimedChain, BundleView, AsOf, } from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Bundler } from "./Bundler";

import { PairSet } from './PairSet';
import { PairMap } from "./PairMap";
import { KeySet } from "./KeySet";
import { Directory } from "./Directory";
import { Box } from "./Box";
import { Sequence } from "./Sequence";
import { Group } from "./Group";
import { Store } from "./Store";
import { Behavior, ChangeBuilder, ContainerBuilder, SyncMessageBuilder } from "./builders";
import { Property } from "./Property";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";
import { Decomposition } from "./Decomposition";
import { MemoryStore } from "./MemoryStore";

/**
 * This is an instance of the Gink database that can be run inside a web browser or via
 * ts-node on a server.  Because of the need to work within a browser it doesn't do any port
 * listening (see GinkListener and GinkServerInstance for that capability).
 */
export class Database {

    ready: Promise<any>;
    readonly peers: Map<number, Peer> = new Map();
    static readonly PROTOCOL = "gink";

    private listeners: Map<string, BundleListener[]> = new Map();
    private countConnections = 0; // Includes disconnected clients.
    private myChain: ClaimedChain;
    private identity: string;
    protected iHave: ChainTracker;

    //TODO: centralize platform dependent code
    private static W3cWebSocket = typeof WebSocket == 'function' ? WebSocket :
        eval("require('websocket').w3cwebsocket");

    constructor(readonly store: Store = new MemoryStore(true),
        identity: string = getIdentity(),
        readonly logger: CallBack = noOp) {
        this.identity = identity;
        this.ready = this.initialize();
    }

    /**
     * Starts a chain or finds one to reuse, then sets myChain.
     */
    private async acquireAppendableChain(): Promise<void> {
        if (this.myChain) return;
        const claimedChains = await this.store.getClaimedChains();
        let reused;
        for (let value of claimedChains.values()) {
            if (!(await isAlive(value.actorId)) && await this.store.getChainIdentity([value.medallion, value.chainStart]) == this.identity) {
                // TODO: check to see if meta-data matches, and overwrite if not
                reused = value;
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
        if (reused) {
            ensure(reused.medallion > 0);
            this.myChain = reused;
        } else {
            const medallion = makeMedallion();
            const chainStart = generateTimestamp();
            const bundler = new Bundler(this.identity, medallion);
            bundler.seal({
                medallion, timestamp: chainStart, chainStart
            });
            ensure(bundler.info.comment == this.identity);
            await this.store.addBundle(bundler, true);
            this.myChain = (await this.store.getClaimedChains()).get(medallion);
            this.iHave.markAsHaving(bundler.info);
            // If there is already a connection before we claim a chain, ensure the
            // peers get this bundle as well so future bundles will be valid extensions.
            for (const peer of this.peers.values()) {
                peer._sendIfNeeded(bundler);
            }
        }
        ensure(this.myChain, "myChain wasn't set.");
        return;
    }

    private async initialize(): Promise<void> {
        await this.store.ready;

        this.iHave = await this.store.getChainTracker();
        this.listeners.set("all", []);
        //this.logger(`Database.ready`);
        const callback = async (bundle: BundleView): Promise<void> => {
            for (const [peerId, peer] of this.peers) {
                peer._sendIfNeeded(bundle);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.listeners.get("all")) {
                listener(bundle.info);
            }
        };
        this.store.addFoundBundleCallBack(callback);
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
     * @returns promise that resolves to the Box container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createBox(change?: Bundler | string): Promise<Box> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.BOX, change);
        return new Box(this, muid, containerBuilder);
    }

    /**
     * Creates a new List container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the List container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createSequence(change?: Bundler | string): Promise<Sequence> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.SEQUENCE, change);
        return new Sequence(this, muid, containerBuilder);
    }

    /**
     * Creates a new Key Set container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Key Set container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createKeySet(change?: Bundler | string): Promise<KeySet> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.KEY_SET, change);
        return new KeySet(this, muid, containerBuilder);
    }

    /**
     * Creates a new Group container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Group container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createGroup(change?: Bundler | string): Promise<Group> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.GROUP, change);
        return new Group(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairSet container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairSet container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createPairSet(change?: Bundler | string): Promise<PairSet> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.PAIR_SET, change);
        return new PairSet(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairMap container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairMap container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createPairMap(change?: Bundler | string): Promise<PairMap> {
        const [muid, containerBuilder] = await this.createContainer(Behavior.PAIR_MAP, change);
        return new PairMap(this, muid, containerBuilder);
    }

    /**
     * Creates a new Directory container (like a javascript map or a python dict).
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Directory container (immediately if a bundler is passed in, otherwise after the bundle)
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
     * Returns an array of Muids of containers that have the provided name.
     * @param name
     * @param asOf optional timestamp to look back to.
     * @returns an array of Muids.
     */
    public async getContainersWithName(name: string, asOf?: AsOf): Promise<Muid[]> {
        return await this.store.getContainersByName(name, asOf);
    }

    /**
    * Adds a listener that will be called every time a bundle is received with the
    * BundleInfo (which contains chain information, timestamp, and bundle comment).
    * @param listener a callback to be invoked when a change occurs in the database or container
    * @param containerMuid the Muid of a container to subscribe to. If left out, subscribe to all containers.
    */
    public addListener(listener: BundleListener, containerMuid?: Muid) {
        const key = containerMuid ? muidToString(containerMuid) : "all";
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(listener);
    }

    /**
     * Adds a bundle to a chain, setting the medallion and timestamps on the bundle in the process.
     *
     * @param bundler a PendingBundle ready to be sealed
     * @returns A promise that will resolve to the bundle timestamp once it's persisted/sent.
     */
    public addBundler(bundler: Bundler): Promise<BundleInfo> {
        return this.ready.then(() => this.acquireAppendableChain().then(() => {
            if (!(this.myChain.medallion > 0))
                throw new Error("zero medallion?");
            const nowMicros = generateTimestamp();
            const lastBundleInfo = this.iHave.getBundleInfo([this.myChain.medallion, this.myChain.chainStart]);
            const seenThrough = lastBundleInfo.timestamp;
            ensure(seenThrough > 0 && (seenThrough < nowMicros));
            const bundleInfo: BundleInfo = {
                medallion: this.myChain.medallion,
                chainStart: this.myChain.chainStart,
                timestamp: seenThrough && (seenThrough >= nowMicros) ? seenThrough + 10 : nowMicros,
                priorTime: seenThrough ?? nowMicros,
            };
            bundler.seal(bundleInfo);
            this.iHave.markAsHaving(bundleInfo);
            return this.receiveBundle(bundler.bytes);
        }));
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
     * Tries to add a bundle to the local store.  If successful (i.e. it hasn't seen it before)
     * then it will also publish that bundle to the connected peers.
     *
     * This is called both from addPendingBundle (for locally produced bundles) and
     * being called by receiveMessage.
     *
     * @param bundleBytes The bytes that correspond to this transaction.
     * @param fromConnectionId The (truthy) connectionId if it came from a peer.
     * @returns
     */
    private receiveBundle(bundleBytes: BundleBytes, fromConnectionId?: number): Promise<BundleInfo> {
        const bundle = new Decomposition(bundleBytes);
        return this.store.addBundle(bundle).then(() => {
            this.logger(`bundle from ${fromConnectionId}: ${JSON.stringify(bundle.info)}`);
            this.iHave.markAsHaving(bundle.info);
            const peer = this.peers.get(fromConnectionId);
            if (peer) {
                peer.hasMap?.markAsHaving(bundle.info);
                peer._sendAck(bundle.info);
            }
            for (const [peerId, peer] of this.peers) {
                if (peerId != fromConnectionId)
                    peer._sendIfNeeded(bundle);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.listeners.get("all")) {
                listener(bundle.info);
            }

            if (this.listeners.size > 1) {
                // Loop through changes and gather a set of changed containers.
                const changedContainers: Set<string> = new Set();
                const changesMap: Map<Offset, ChangeBuilder> = bundle.builder.getChangesMap();
                for (const [offset, changeBuilder] of changesMap.entries()) {
                    const entry = changeBuilder.getEntry();
                    const clearance = changeBuilder.getClearance();
                    let container;
                    if (entry) {
                        container = entry.getContainer();
                    }
                    else if (clearance) {
                        container = clearance.getContainer();
                    }
                    if (container && container.getTimestamp() && container.getMedallion() && container.getOffset()) {
                        const muid = builderToMuid(
                            container,
                            {
                                timestamp: bundle.info.timestamp,
                                medallion: bundle.info.medallion,
                                offset: offset
                            }
                        );
                        const stringMuid = muidToString(muid);
                        changedContainers.add(stringMuid);
                    }
                }
                // Send to listeners specifically subscribed to each container.
                for (const strMuid of changedContainers) {
                    const containerListeners = this.listeners.get(strMuid);
                    if (containerListeners) {
                        for (const listener of containerListeners) {
                            listener(bundle.info);
                        }
                    }
                }
            }
            return bundle.info;
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
        try {
            const parsed = <SyncMessageBuilder>SyncMessageBuilder.deserializeBinary(messageBytes);
            if (parsed.hasBundle()) {
                const bundleBytes: BundleBytes = parsed.getBundle_asU8();
                await this.receiveBundle(bundleBytes, fromConnectionId);
                return;
            }
            if (parsed.hasGreeting()) {
                this.logger(`got greeting from ${fromConnectionId}`);
                const greeting = parsed.getGreeting();
                peer._receiveHasMap(new ChainTracker({ greeting }));
                await this.store.getBundles(peer._sendIfNeeded.bind(peer));
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
        await this.acquireAppendableChain();
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
