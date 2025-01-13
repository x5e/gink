import { Peer } from "./Peer";
import {
    makeMedallion,
    ensure,
    noOp,
    generateTimestamp,
    muidToString,
    builderToMuid,
    encodeToken,
    getIdentity,
    createKeyPair,
    muidTupleToMuid,
    signBundle,
} from "./utils";
import {
    BundleBytes,
    BundleListener,
    CallBack,
    BundleInfo,
    Muid,
    BundleView,
    AsOf,
    KeyPair,
    MuidTuple,
    Medallion,
    Meta,
    Bundler,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";

import { Store } from "./Store";
import {
    Behavior,
    ChangeBuilder,
    SyncMessageBuilder,
    BundleBuilder,
} from "./builders";
import { Decomposition } from "./Decomposition";
import { MemoryStore } from "./MemoryStore";
import { construct } from "./factories";
import { BoundBundler } from "./BoundBundler";
import { PromiseChainLock } from "./PromiseChainLock";
import { Property } from "./Property";

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
    private identity?: string;
    protected iHave: ChainTracker;
    private static lastCreated?: Database;
    readonly store: Store;
    protected logger: CallBack;
    protected promiseChainLock = new PromiseChainLock();
    protected medallion?: Medallion;
    protected keyPair?: KeyPair;
    protected lastLink?: BundleInfo;

    //TODO: centralize platform dependent code
    private static W3cWebSocket =
        typeof WebSocket === "function"
            ? WebSocket
            : eval("require('websocket').w3cwebsocket");

    constructor(args?: {
        store?: Store;
        logger?: CallBack;
        identity?: string;
    }) {
        this.store = args?.store ?? new MemoryStore(true);
        this.logger = args?.logger ?? noOp;
        this.ready = this.initialize();
        this.identity = args?.identity;
        Database.lastCreated = this;
    }

    public getLastLink(): BundleInfo | undefined {
        return this.lastLink;
    }

    public static get recent(): Database {
        return ensure(Database.lastCreated, "no database created");
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

    private async completeBundle(
        changes: ChangeBuilder[],
        meta?: Meta,
    ): Promise<BundleInfo> {
        // I'm acquiring a lock here to ensure that the chain doesn't get forked.
        const unlockingFunction = await this.promiseChainLock.acquireLock();
        try {
            const bundleBuilder = new BundleBuilder();
            if (meta.comment) bundleBuilder.setComment(meta.comment);
            if (!this.medallion) throw new Error("missing medallion!");
            bundleBuilder.setMedallion(this.medallion);
            const timestamp = generateTimestamp();
            bundleBuilder.setTimestamp(timestamp);
            if (this.lastLink) {
                bundleBuilder.setPrevious(this.lastLink.timestamp);
                bundleBuilder.setChainStart(this.lastLink.chainStart);
                bundleBuilder.setPriorHash(this.lastLink.hashCode);
            } else {
                bundleBuilder.setChainStart(timestamp);
                bundleBuilder.setIdentity(this.identity);
                bundleBuilder.setVerifyKey(this.keyPair.publicKey);
            }
            bundleBuilder.setChangesList(changes);
            const bundleBytes = signBundle(
                bundleBuilder.serializeBinary(),
                this.keyPair.secretKey,
            );
            const decomposition = new Decomposition(bundleBytes);
            /*
                I need to set the lastLink before the transaction to add it is completed,
                because if I don't then it can't do the transaction combining
                (allowing multiple gink transactions to exist in an indexed db transaction).
                Transactions headed to the store are still serialized due the promiseChainLock,
                but there's a potential problem where a transaction fails at the store level
                but then not unrolled at the database level.  This can't be solved simply
                by using a catch clause because we could have several transactions queued.
            */
            this.lastLink = decomposition.info;
            return this.receiveBundle(decomposition);
        } finally {
            unlockingFunction();
        }
    }

    public async startBundle(meta?: Meta): Promise<Bundler> {
        if (meta?.bundler) return meta.bundler;
        if (!this.medallion) {
            const unlockingFunction = await this.promiseChainLock.acquireLock();
            try {
                await this.obtainMedallion(
                    meta?.identity ?? this.identity ?? getIdentity(),
                );
            } finally {
                unlockingFunction();
            }
        }
        return new BoundBundler(
            this.medallion,
            this.completeBundle.bind(this),
            meta,
        );
    }

    private async obtainMedallion(identity: string): Promise<void> {
        const toReuse = await this.store.acquireChain(identity);
        if (toReuse) {
            ensure(toReuse.medallion > 0);
            const publicKey = await this.store.getVerifyKey([
                toReuse.medallion,
                toReuse.chainStart,
            ]);
            ensure(publicKey);
            this.keyPair = ensure(await this.store.pullKeyPair(publicKey));
            this.lastLink = toReuse;
        } else {
            this.keyPair = createKeyPair();
            await this.store.saveKeyPair(this.keyPair);
            this.medallion = makeMedallion();
        }
        this.identity = identity;
    }

    async reset(toTime?: AsOf, meta?: Meta): Promise<void> {
        let bundler: Bundler = await this.startBundle(meta);
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
        for (const behavior of globalBehaviors) {
            const address = { timestamp: -1, medallion: -1, offset: behavior };
            const container = await construct(this, address);
            await container.reset(toTime, false, { bundler });
            await container.resetProperties(toTime, { bundler });
        }
        const containers = await this.store.getAllContainerTuples();

        for (const muidTuple of containers) {
            const container = await construct(this, muidTupleToMuid(muidTuple));
            if (container instanceof Property) continue;
            await container.reset(toTime, false, { bundler });
            await container.resetProperties(toTime, { bundler });
        }

        if (!meta?.bundler) {
            await bundler.commit();
        }
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
        remoteOnly: boolean = false,
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
        containerMuid?: Muid,
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
        fromConnectionId?: number,
    ): Promise<BundleInfo> {
        return this.store.addBundle(bundle).then((added) => {
            if (!added) return;
            const summary = JSON.stringify(bundle.info, [
                "medallion",
                "timestamp",
                "comment",
            ]);
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
        fromConnectionId: number,
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
                    `got ack from ${fromConnectionId}: ${JSON.stringify(info)}`,
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
        },
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
                protocols,
            );
            websocketClient.binaryType = "arraybuffer";
            const peer = new Peer(
                websocketClient.send.bind(websocketClient),
                websocketClient.close.bind(websocketClient),
            );

            websocketClient.onopen = function (_ev: Event) {
                // called once the new connection has been established
                websocketClient.send(
                    thisClient.iHave.getGreetingMessageBytes(),
                );
                thisClient.peers.set(connectionId, peer);
                if (resolveOnOpen) resolve(peer);
                else peer.ready.then(resolve);
            };
            websocketClient.onerror = function (ev: Event) {
                // if/when this is called depends on the details of the websocket implementation
                console.error(
                    `error on connection ${connectionId} to ${target}, ${ev}`,
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
                            setTimeout(resolve, retry_ms + jitter),
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
                                    Math.random() * 1000 * Math.pow(2, pow),
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
