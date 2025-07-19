import { AbstractConnection } from "./AbstractConnection";
import {
    generateMedallion,
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
    Medallion,
    Meta,
    Bundler,
    Connection,
} from "./typedefs";
import { HasMap } from "./HasMap";

import { Store } from "./Store";
import {
    Behavior,
    ChangeBuilder,
    SyncMessageBuilder,
    BundleBuilder,
    SignalType,
} from "./builders";
import { Decomposition } from "./Decomposition";
import { MemoryStore } from "./MemoryStore";
import { construct } from "./factories";
import { BoundBundler } from "./BoundBundler";
import { PromiseChainLock } from "./PromiseChainLock";
import { Property } from "./Property";
import { inspectSymbol } from "./utils";
import { Directory } from "./Directory";
import { ClientConnection } from "./ClientConnection";

/**
 * This is an instance of the Gink database that can be run inside a web browser or via
 * ts-node on a server.  Because of the need to work within a browser it doesn't do any port
 * listening (see SimpleServer for that capability).
 */
export class Database {
    ready: Promise<any>;
    readonly connections: Map<number, AbstractConnection> = new Map();
    readonly connectionsByEndpoint: Map<string, AbstractConnection> = new Map();

    private listeners: Map<string, Map<string, BundleListener[]>> = new Map();
    private countConnections = 0; // Includes disconnected clients.
    private identity?: string;
    protected iHave: HasMap;
    private static lastCreated?: Database;
    readonly store: Store;
    protected logger: CallBack;
    protected promiseChainLock = new PromiseChainLock();
    protected medallion?: Medallion;
    protected keyPair?: KeyPair;
    protected lastLink?: BundleInfo;

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

    [inspectSymbol](depth, opts) {
        return this.toString();
    }

    public toString(): string {
        return `[Database]`;
    }

    public getRoot() {
        return Directory.get(this);
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
            for (const [peerId, peer] of this.connections) {
                peer.sendIfNeeded(bundle);
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
            this.medallion = toReuse.medallion;
        } else {
            this.keyPair = createKeyPair();
            await this.store.saveKeyPair(this.keyPair);
            this.medallion = generateMedallion();
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
    ): () => void {
        const key = containerMuid ? muidToString(containerMuid) : "all";
        this.logger(`adding listener for ${key}, remoteOnly: ${remoteOnly}`);
        if (!this.listeners.has(key)) {
            const innerMap = new Map();
            innerMap.set("all_bundles", []);
            innerMap.set("remote_only", []);
            this.listeners.set(key, innerMap);
        }
        const which = remoteOnly ? "remote_only" : "all_bundles";
        const array = this.listeners.get(key).get(which);
        array.push(listener);
        return () => {
            const index = array.indexOf(listener);
            if (index !== -1) {
                array.splice(index, 1);
                this.logger(
                    `successfully removed listener for ${key}, remoteOnly: ${remoteOnly}`,
                );
            } else {
                this.logger(
                    `listener not found for ${key}, remoteOnly: ${remoteOnly} (already removed)`,
                );
            }
        };
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
        for (const peer of this.connections.values()) {
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
        const claimChain = !(
            fromConnectionId || bundle.info.chainStart != bundle.info.timestamp
        );
        return this.store.addBundle(bundle, claimChain).then((added) => {
            if (!added) return;
            const summary = JSON.stringify(bundle.info, [
                "medallion",
                "timestamp",
                "comment",
            ]);
            this.logger(
                `added bundle from ${fromConnectionId ?? "local"}: ${summary}`,
            );
            this.iHave.markAsHaving(bundle.info);
            const fromConnection = this.connections.get(fromConnectionId);
            if (fromConnection) {
                fromConnection.onReceivedBundle(bundle.info);
            }
            for (const [peerId, peer] of this.connections) {
                if (peerId !== fromConnectionId) peer.sendIfNeeded(bundle);
            }
            // Send to listeners subscribed to all containers.
            for (const listener of this.getListeners()) {
                listener(bundle);
            }

            // TODO: maybe remove?  a lot of computation may not be necessary
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
    ): Promise<void> {
        await this.ready;
        const connection = this.connections.get(fromConnectionId);
        if (!connection)
            throw Error("Got a message from a peer I don't have a proxy for?");

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
            connection.setPeerHasMap(new HasMap({ greeting }));
            await this.store.getBundles(
                connection.sendIfNeeded.bind(connection),
            );
            connection.markHasSentInitialSync();
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
                `got ack from ${fromConnectionId}: ${JSON.stringify(info, ["timestamp", "medallion"])}`,
            );
            connection.onAck(info);
        }
        if (parsed.hasSignal()) {
            const signal = parsed.getSignal();
            const signalType = signal.getSignalType();
            if (signalType === SignalType.BUNDLES_SENT) {
                connection.markHasRecvInitialSync();
                this.logger(
                    `received everything from connection number ${fromConnectionId}`,
                );
            } else {
                console.error(
                    `received unknown signal from ${fromConnectionId}: ${signalType}`,
                );
            }
        }
    }

    protected onConnectionOpen(connectionId: number) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            console.error(
                `got connection open but connection ${connectionId} not found`,
            );
            return;
        }
        connection.send(this.iHave.getGreetingMessageBytes());
        connection.markHasSentGreeting();
        this.logger(`connection ${connectionId} opened and greeting sent`);
    }

    public connectTo(
        endpoint: string,
        options?: {
            authToken?: string;
            reconnectOnClose?: boolean;
            onError?: CallBack;
        },
    ): Connection {
        const { authToken, reconnectOnClose } = options ?? {};
        if (this.connectionsByEndpoint.has(endpoint)) {
            return this.connectionsByEndpoint.get(endpoint);
        }
        const connectionId = this.createConnectionId();
        const connection = new ClientConnection({
            endpoint,
            authToken,
            reconnectOnClose,
            onOpen: () => this.onConnectionOpen(connectionId),
            onData: (data) => this.receiveMessage(data, connectionId),
            logger: this.logger,
            waitFor: this.ready,
            onError: options?.onError,
        });
        this.connections.set(connectionId, connection);
        return connection;
    }
}
