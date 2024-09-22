import { Peer } from "./Peer";
import {
    makeMedallion,
    ensure,
    noOp,
    generateTimestamp,
    muidToString,
    builderToMuid,
    encodeToken,
    isAlive,
    getIdentity,
    createKeyPair,
    strToMuid,
    muidTupleToMuid,
} from "./utils";
import {
    BundleBytes,
    BundleListener,
    CallBack,
    BundleInfo,
    Muid,
    ClaimedChain,
    BundleView,
    AsOf,
    KeyPair,
    MuidTuple,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Bundler } from "./Bundler";

import { PairSet } from "./PairSet";
import { PairMap } from "./PairMap";
import { KeySet } from "./KeySet";
import { Directory } from "./Directory";
import { Box } from "./Box";
import { Sequence } from "./Sequence";
import { Group } from "./Group";
import { Store } from "./Store";
import {
    Behavior,
    ChangeBuilder,
    ContainerBuilder,
    SyncMessageBuilder,
} from "./builders";
import { Property } from "./Property";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";
import { Decomposition } from "./Decomposition";
import { MemoryStore } from "./MemoryStore";
import { construct } from "./factories";
import { Container } from "./Container";

/**
 * This is an instance of the Gink database that can be run inside a web browser or via
 * ts-node on a server.  Because of the need to work within a browser it doesn't do any port
 * listening (see SimpleServer for that capability).
 */
export class Database {
    ready: Promise<any>;
    readonly peers: Map<number, Peer> = new Map();
    static readonly PROTOCOL = "gink";

    private listeners: Map<string, Map<string, BundleListener[]>> = new Map();
    private countConnections = 0; // Includes disconnected clients.
    private lastLinkToExtend: BundleInfo;
    private keyPair: KeyPair;
    private identity: string;
    private chainGetter?: Promise<BundleInfo> = undefined;
    protected iHave: ChainTracker;

    //TODO: centralize platform dependent code
    private static W3cWebSocket =
        typeof WebSocket === "function"
            ? WebSocket
            : eval("require('websocket').w3cwebsocket");

    constructor(
        readonly store: Store = new MemoryStore(true),
        identity: string = getIdentity(),
        readonly logger: CallBack = noOp
    ) {
        this.identity = identity;
        this.ready = this.initialize();
    }

    private async initialize(): Promise<void> {
        await this.store.ready;
        this.iHave = await this.store.getChainTracker();

        const innerMap = new Map();
        innerMap.set("all_bundles", []);
        innerMap.set("remote_only", []);
        this.listeners.set("all", innerMap);

        const callback = async (bundle: BundleView): Promise<void> => {
            for (const [peerId, peer] of this.peers) {
                peer._sendIfNeeded(bundle);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.getListeners()) {
                listener(bundle);
            }
        };
        this.store.addFoundBundleCallBack(callback);
    }

    /**
     * Starts a chain or finds one to reuse, then sets myChain.
     */
    public getChain(): Promise<BundleInfo> {
        if (!this.chainGetter) this.chainGetter = this.getChainHelper();
        return this.chainGetter;
    }

    private async getChainHelper(): Promise<BundleInfo> {
        if (this.lastLinkToExtend) return this.lastLinkToExtend;
        this.logger("calling getChain()");
        const claimedChains = await this.store.getClaimedChains();
        let toReuse: ClaimedChain;
        for (let value of claimedChains.values()) {
            const chainId = await this.store.getChainIdentity([
                value.medallion,
                value.chainStart,
            ]);
            this.logger(`considering chain: ${JSON.stringify(value)}`);
            if (chainId !== this.identity) {
                this.logger(
                    `identities don't match: ${chainId} ${this.identity}`
                );
                continue;
            }
            if (await isAlive(value.actorId)) {
                this.logger(`actor is still alive`);
                continue;
            }
            // TODO: check to see if meta-data matches, and overwrite if not
            toReuse = value;
            if (typeof window !== "undefined") {
                // If we are running in a browser and take over a chain,
                // start a new heartbeat.
                setInterval(() => {
                    window.localStorage.setItem(
                        `gink-${value.actorId}`,
                        `${Date.now()}`
                    );
                }, 1000);
            }
            break;
        }
        if (toReuse) {
            ensure(toReuse.medallion > 0);
            const publicKey = await this.store.getVerifyKey([
                toReuse.medallion,
                toReuse.chainStart,
            ]);
            ensure(publicKey);
            this.keyPair = ensure(await this.store.pullKeyPair(publicKey));
            this.lastLinkToExtend = this.iHave.getBundleInfo([
                toReuse.medallion,
                toReuse.chainStart,
            ]);
        } else {
            const medallion = makeMedallion();
            const chainStart = generateTimestamp();
            const keyPair = createKeyPair();
            await this.store.saveKeyPair(keyPair);
            this.keyPair = keyPair;
            const bundler = new Bundler(undefined, medallion);
            // Starting a new chain, so don't have/need a prior_hash.
            bundler.seal(
                {
                    medallion,
                    timestamp: chainStart,
                    chainStart,
                },
                keyPair,
                undefined,
                this.identity
            );
            ensure(bundler.builder.getIdentity() === this.identity);
            await this.store.addBundle(bundler, true);
            this.lastLinkToExtend = bundler.info;
            ensure(
                this.lastLinkToExtend.hashCode &&
                    this.lastLinkToExtend.hashCode.length == 32
            );
            this.iHave.markAsHaving(bundler.info);
            this.logger(
                `started chain with ${JSON.stringify(bundler.info, ["medallion", "chainStart"])}`
            );
            // If there is already a connection before we claim a chain, ensure the
            // peers get this bundle as well so future bundles will be valid extensions.
            for (const peer of this.peers.values()) {
                peer._sendIfNeeded(bundler);
            }
        }
        ensure(this.lastLinkToExtend, "myChain wasn't set.");
        ensure(
            this.lastLinkToExtend.hashCode &&
                this.lastLinkToExtend.hashCode.length == 32
        );
        return this.lastLinkToExtend;
    }

    /**
     * Reset all containers in the database to a previous time.
     * @param toTime optional timestamp to reset to. If not provided, each container
     * will be cleared.
     * @param bundlerOrComment optional bundler to add this change to, or a string to
     * add a comment to a new bundle.
     */
    async reset(
        toTime?: AsOf,
        bundlerOrComment?: Bundler | string
    ): Promise<void> {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        // Leaving off Behavior.PROPERTY since each individual property will get reset
        // with the other container reset calls
        const globalBehaviors = [
            Behavior.BOX,
            Behavior.SEQUENCE,
            Behavior.PAIR_MAP,
            Behavior.DIRECTORY,
            Behavior.KEY_SET,
            Behavior.GROUP,
            Behavior.PAIR_SET,
        ];
        const globalContainers: MuidTuple[] = [];
        for (const behavior of globalBehaviors) {
            globalContainers.push([-1, -1, behavior]);
        }
        const containers = await this.store.getAllContainerTuples();

        for (const muidTuple of containers) {
            const container = await construct(this, muidTupleToMuid(muidTuple));
            if (container instanceof Property) continue;
            await container.reset({ toTime, bundlerOrComment: bundler });
        }

        for (const muidTuple of globalContainers) {
            const container = await construct(this, muidTupleToMuid(muidTuple));
            await container.reset({ toTime, bundlerOrComment: bundler });
        }

        if (immediate) {
            await this.addBundler(bundler);
        }
    }

    /**
     * Reset the properties associated with a container to a previous time.
     * @param toTime optional timestamp to reset to. If not provided, the properties will be deleted.
     * @param bundlerOrComment optional bundler to add this change to, or a string to add a comment to a new bundle.
     */
    async resetContainerProperties(
        container: Muid | Container,
        toTime?: AsOf,
        bundlerOrComment?: Bundler | string
    ): Promise<void> {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        if ("timestamp" in container) {
            container = await construct(this, container);
        }
        if (!(container instanceof Container))
            throw new Error("something went wrong");

        const propertiesNow =
            await this.store.getContainerProperties(container);
        if (!toTime) {
            for (const [key, _] of propertiesNow.entries()) {
                const property = <Property>(
                    await construct(this, strToMuid(key))
                );
                ensure(
                    property.behavior === Behavior.PROPERTY,
                    "constructed container isn't a property?"
                );
                await property.delete(container, bundler);
            }
        } else {
            const propertiesThen = await this.store.getContainerProperties(
                container,
                toTime
            );

            for (const [key, value] of propertiesThen.entries()) {
                if (value !== propertiesNow.get(key)) {
                    const property = <Property>(
                        await construct(this, strToMuid(key))
                    );
                    ensure(
                        property.behavior === Behavior.PROPERTY,
                        "constructed container isn't a property?"
                    );
                    await property.set(container, value, bundler);
                }
                // Remove from propertiesNow so we can delete the rest
                // after this iteration
                propertiesNow.delete(key);
            }
            // Now loop through the remaining propertiesNow and delete them
            for (const [key, _] of propertiesNow.entries()) {
                const property = <Property>(
                    await construct(this, strToMuid(key))
                );
                ensure(
                    property.behavior === Behavior.PROPERTY,
                    "constructed container isn't a property?"
                );
                await property.delete(container, bundler);
            }
        }
        if (immediate) {
            await this.addBundler(bundler);
        }
    }

    /**
     * Returns a handle to the magic global directory.  Primarily intended for testing.
     * @returns a "magic" global directory that always exists and is accessible by all instances
     */
    getGlobalDirectory(): Directory {
        return new Directory(this, {
            timestamp: -1,
            medallion: -1,
            offset: Behavior.DIRECTORY,
        });
    }

    getGlobalProperty(): Property {
        return new Property(this, {
            timestamp: -1,
            medallion: -1,
            offset: Behavior.PROPERTY,
        });
    }

    getMedallionDirectory(): Directory {
        return new Directory(this, {
            timestamp: -1,
            medallion: this.lastLinkToExtend[0],
            offset: Behavior.DIRECTORY,
        });
    }

    /**
     * Creates a new box container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Box container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createBox(change?: Bundler | string): Promise<Box> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.BOX,
            change
        );
        return new Box(this, muid, containerBuilder);
    }

    /**
     * Creates a new List container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the List container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createSequence(change?: Bundler | string): Promise<Sequence> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.SEQUENCE,
            change
        );
        return new Sequence(this, muid, containerBuilder);
    }

    /**
     * Creates a new Key Set container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Key Set container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createKeySet(change?: Bundler | string): Promise<KeySet> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.KEY_SET,
            change
        );
        return new KeySet(this, muid, containerBuilder);
    }

    /**
     * Creates a new Group container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Group container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createGroup(change?: Bundler | string): Promise<Group> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.GROUP,
            change
        );
        return new Group(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairSet container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairSet container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createPairSet(change?: Bundler | string): Promise<PairSet> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.PAIR_SET,
            change
        );
        return new PairSet(this, muid, containerBuilder);
    }

    /**
     * Creates a new PairMap container.
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the PairMap container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    async createPairMap(change?: Bundler | string): Promise<PairMap> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.PAIR_MAP,
            change
        );
        return new PairMap(this, muid, containerBuilder);
    }

    /**
     * Creates a new Directory container (like a javascript map or a python dict).
     * @param change either the bundler to add this box creation to, or a comment for an immediate change
     * @returns promise that resolves to the Directory container (immediately if a bundler is passed in, otherwise after the bundle)
     */
    // TODO: allow user to specify the types allowed for keys and values
    async createDirectory(change?: Bundler | string): Promise<Directory> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.DIRECTORY,
            change
        );
        return new Directory(this, muid, containerBuilder);
    }

    async createVertex(change?: Bundler | string): Promise<Vertex> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.VERTEX,
            change
        );
        return new Vertex(this, muid, containerBuilder);
    }

    async createEdgeType(change?: Bundler | string): Promise<EdgeType> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.EDGE_TYPE,
            change
        );
        return new EdgeType(this, muid, containerBuilder);
    }

    async createProperty(
        bundlerOrComment?: Bundler | string
    ): Promise<Property> {
        const [muid, containerBuilder] = await this.createContainer(
            Behavior.PROPERTY,
            bundlerOrComment
        );
        return new Property(this, muid, containerBuilder);
    }

    protected async createContainer(
        behavior: Behavior,
        change?: Bundler | string
    ): Promise<[Muid, ContainerBuilder]> {
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
    public async getContainersWithName(
        name: string,
        asOf?: AsOf
    ): Promise<Muid[]> {
        return await this.store.getContainersByName(name, asOf);
    }

    /**
     * Adds a listener that will be called every time a bundle is received with the
     * BundleInfo (which contains chain information, timestamp, and bundle comment).
     * @param listener a callback to be invoked when a change occurs in the database or container
     * @param containerMuid the Muid of a container to subscribe to. If left out, subscribe to all containers.
     */
    public addListener(
        listener: BundleListener,
        containerMuid?: Muid,
        remoteOnly: boolean = false
    ) {
        const key = containerMuid ? muidToString(containerMuid) : "all";
        if (!this.listeners.has(key)) {
            const innerMap = new Map();
            innerMap.set("all_bundles", []);
            innerMap.set("remote_only", []);
            this.listeners.set(key, innerMap);
        }
        const which = remoteOnly ? "remote_only" : "all_bundles";
        this.listeners.get(key).get(which).push(listener);
    }

    /**
     * Gets a list of bundle listeners per container, listening to all bundles or just remote.
     * @param remoteOnly true if looking for listeners only subscribed to remote bundles.
     * @param containerMuid optional container muid to find listeners subscribed to a specific container.
     */
    private getListeners(
        remoteOnly: boolean = false,
        containerMuid?: Muid
    ): BundleListener[] {
        const key = containerMuid ? muidToString(containerMuid) : "all";
        const containerMap = this.listeners.get(key);
        if (!containerMap) return [];
        const innerMap = remoteOnly
            ? containerMap.get("remote_only")
            : containerMap.get("all_bundles");
        return innerMap || [];
    }

    /**
     * Adds a bundle to a chain, setting the medallion and timestamps on the bundle in the process.
     *
     * @param bundler a PendingBundle ready to be sealed
     * @returns A promise that will resolve to the bundle timestamp once it's persisted/sent.
     */
    public addBundler(bundler: Bundler): Promise<BundleInfo> {
        return this.ready.then(() =>
            this.getChain().then(() => {
                const nowMicros = generateTimestamp();
                const seenThrough = this.lastLinkToExtend.timestamp;
                const newTimestamp =
                    nowMicros > seenThrough ? nowMicros : seenThrough + 10;
                ensure(seenThrough > 0 && seenThrough < nowMicros);
                const bundleInfo: BundleInfo = {
                    medallion: this.lastLinkToExtend.medallion,
                    chainStart: this.lastLinkToExtend.chainStart,
                    timestamp: newTimestamp,
                    priorTime: seenThrough,
                };
                bundler.seal(
                    bundleInfo,
                    this.keyPair,
                    this.lastLinkToExtend.hashCode
                );
                // The bundle is seralized then deserialized to catch problems before broadcasting.
                const decomposition = new Decomposition(bundler.bytes);
                this.lastLinkToExtend = decomposition.info;
                return this.receiveBundle(decomposition);
            })
        );
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
    private receiveBundle(
        bundle: BundleView,
        fromConnectionId?: number
    ): Promise<BundleInfo> {
        return this.store.addBundle(bundle).then((added) => {
            if (!added) return;
            let summary;
            if (bundle.info.chainStart === bundle.info.timestamp) {
                summary = JSON.stringify(bundle.info, [
                    "medallion",
                    "timestamp",
                    "chainStart",
                ]);
            } else {
                summary = JSON.stringify(bundle.info, [
                    "medallion",
                    "timestamp",
                    "priorTime",
                ]);
            }
            this.logger(`added bundle from ${fromConnectionId}: ${summary}`);
            this.iHave.markAsHaving(bundle.info);
            const peer = this.peers.get(fromConnectionId);
            if (peer) {
                peer.hasMap?.markAsHaving(bundle.info);
                peer._sendAck(bundle.info);
            }
            for (const [peerId, peer] of this.peers) {
                if (peerId !== fromConnectionId) peer._sendIfNeeded(bundle);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.getListeners()) {
                listener(bundle);
            }

            if (this.listeners.size > 1) {
                // Loop through changes and gather a set of changed containers.
                const changedContainers: Set<Muid> = new Set();
                const changesList: Array<ChangeBuilder> =
                    bundle.builder.getChangesList();
                for (let index = 0; index < changesList.length; index++) {
                    const offset = index + 1;
                    const changeBuilder = changesList[index];
                    const entry = changeBuilder.getEntry();
                    const clearance = changeBuilder.getClearance();
                    let container;
                    if (entry) {
                        container = entry.getContainer();
                    } else if (clearance) {
                        container = clearance.getContainer();
                    }
                    if (
                        container &&
                        container.getTimestamp() &&
                        container.getMedallion() &&
                        container.getOffset()
                    ) {
                        const muid = builderToMuid(container, {
                            timestamp: bundle.info.timestamp,
                            medallion: bundle.info.medallion,
                            offset: offset,
                        });
                        changedContainers.add(muid);
                    }
                }
                // Send to listeners specifically subscribed to each container.
                for (const muid of changedContainers) {
                    const containerListeners = this.getListeners(false, muid);
                    const remoteOnlyListeners = this.getListeners(true, muid);
                    for (const listener of containerListeners) {
                        listener(bundle);
                    }
                    if (fromConnectionId) {
                        for (const remoteListener of remoteOnlyListeners) {
                            remoteListener(bundle);
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
    protected async receiveMessage(
        messageBytes: Uint8Array,
        fromConnectionId: number
    ) {
        await this.ready;
        const peer = this.peers.get(fromConnectionId);
        if (!peer)
            throw Error("Got a message from a peer I don't have a proxy for?");
        try {
            const parsed = <SyncMessageBuilder>(
                SyncMessageBuilder.deserializeBinary(messageBytes)
            );
            if (parsed.hasBundle()) {
                const bundleBytes: BundleBytes = parsed.getBundle_asU8();
                const decomposition = new Decomposition(bundleBytes);
                await this.receiveBundle(decomposition, fromConnectionId);
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
                    chainStart: ack.getChainStart(),
                };
                this.logger(
                    `got ack from ${fromConnectionId}: ${JSON.stringify(info)}`
                );
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
     * @param retryOnDisconnect if true, try to reconnect (with backoff) if the server closes the connection
     * @returns a promise to the peer
     */
    public async connectTo(
        target: string,
        options?: {
            onClose?: CallBack;
            resolveOnOpen?: boolean;
            retryOnDisconnect?: boolean;
            authToken?: string;
        }
    ): Promise<Peer> {
        //TODO(https://github.com/google/gink/issues/69): have the default be to wait for databases to sync
        const onClose: CallBack =
            options && options.onClose ? options.onClose : noOp;
        const resolveOnOpen: boolean =
            options && options.resolveOnOpen ? options.resolveOnOpen : false;
        const retryOnDisconnect =
            options && options.retryOnDisconnect === false ? false : true;
        const authToken: string =
            options && options.authToken ? options.authToken : undefined;

        await this.ready;
        const thisClient = this;
        return new Promise<Peer>((resolve, reject) => {
            let protocols = [Database.PROTOCOL];

            if (authToken) protocols.push(encodeToken(authToken));
            const connectionId = this.createConnectionId();
            let websocketClient: WebSocket = new Database.W3cWebSocket(
                target,
                protocols
            );
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient)
            );

            websocketClient.onopen = function (_ev: Event) {
                // called once the new connection has been established
                websocketClient.send(
                    thisClient.iHave.getGreetingMessageBytes()
                );
                thisClient.peers.set(connectionId, peer);
                if (resolveOnOpen) resolve(peer);
                else peer.ready.then(resolve);
            };
            websocketClient.onerror = function (ev: Event) {
                // if/when this is called depends on the details of the websocket implementation
                console.error(
                    `error on connection ${connectionId} to ${target}, ${ev}`
                );
                reject(ev);
            };
            websocketClient.onclose = async function (ev: CloseEvent) {
                // this should always be called once the peer disconnects, including in cases of error
                onClose(`closed connection ${connectionId} to ${target}`);

                // If the connection was never successfully established, then
                // reject the promise returned from the outer connectTo.
                reject(ev);

                // I'm intentionally leaving the peer object in the peers map just in case we get data from them.
                // thisClient.peers.delete(connectionId);  // might still be processing data from peer
                if (retryOnDisconnect) {
                    let peer: Peer;
                    let pow = 0;
                    let retry_ms = 1000;
                    let jitter = Math.floor(Math.random() * 1000);
                    while (!peer) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, retry_ms + jitter)
                        );
                        try {
                            console.log(`retrying connection to ${target}`);
                            peer = await thisClient.connectTo(target, options);

                            if (peer) {
                                console.log(`reconnected to ${target}`);
                                break;
                            }
                        } catch (e) {
                            console.error(`retry failed: ${e.message}`);
                        } finally {
                            if (retry_ms < 30000) {
                                pow += 1;
                                retry_ms = 1000 * Math.pow(2, pow);
                                jitter = Math.floor(
                                    Math.random() * 1000 * Math.pow(2, pow)
                                );
                            }
                        }
                    }
                }
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
