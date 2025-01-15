import {
    Medallion,
    ChainStart,
    Bytes,
    AsOf,
    ScalarKey,
    ClaimedChain,
    ActorId,
    BroadcastFunc,
    BundleView,
    KeyPair,
    Value,
    Placement,
    MuidTuple,
} from "./typedefs";
import { BundleInfo, Muid, Entry } from "./typedefs";
import { MemoryStore } from "./MemoryStore";
import { Store } from "./Store";
import { PromiseChainLock } from "./PromiseChainLock";
import { LockableLog } from "./LockableLog";
import { watch, FSWatcher } from "fs";
import { ChainTracker } from "./ChainTracker";
import { ClaimBuilder, LogFileBuilder, KeyPairBuilder } from "./builders";
import { generateTimestamp, ensure, getActorId, concatenate, isAlive } from "./utils";
import { Decomposition } from "./Decomposition";

/*
    At time of writing, there's only an in-memory implementation of
    IndexedDB available for Node.js.  This subclass will append all
    transactions it receives to a log file, making it possible to
    recreate the same in-memory database in the future by simply
    replaying the receipt of each bundle.

    This is obviously not ideal; eventually want to move to either
    a durable server side indexedDB implementation or create an
    implementation of Store using some other system (e.g. LMDB).
*/

export class LogBackedStore extends LockableLog implements Store {
    private bundlesProcessed = 0;
    private hasMap: ChainTracker = new ChainTracker({});

    private claimedChains: Map<number, ClaimedChain> = new Map();
    private identities: Map<string, string> = new Map(); // Medallion,ChainStart => identity

    // While the operating system lock prevents other processes from writing to this file,
    // we need to prevent multiple async tasks within this process from trying to interleave operations.
    // The memory lock accomplishes this.  It might not strictly be necessary, because of how the
    // rest of the system is designed, but the overhead is expected to be minimal and may prevent
    // some foot shooting.
    private memoryLock: PromiseChainLock = new PromiseChainLock();
    private redTo: number = 0;
    private fileWatcher: FSWatcher;
    private foundBundleCallBacks: BroadcastFunc[] = [];
    private opened: boolean = false;
    private closed: boolean = false;
    private logBackedStoreReady: Promise<void>;

    /**
     *
     * @param filename file to store transactions and chain ownership information
     * @param exclusive if true, lock the file until closing store, otherwise only lock as-needed.
     */
    constructor(
        readonly filename: string,
        readonly exclusive: boolean = false,
        private internalStore = new MemoryStore(),
    ) {
        super(filename, exclusive);
        this.logBackedStoreReady = super.ready.then(() =>
            this.initializeLogBackedStore(),
        );
    }

    get ready() {
        return this.logBackedStoreReady;
    }

    async getBillionths(muid: Muid, asOf?: AsOf): Promise<bigint> {
        await this.pullDataFromFile();
        return this.internalStore.getBillionths(muid, asOf);
    }

    async getVerifyKey(chainInfo: [Medallion, ChainStart]): Promise<Bytes> {
        await this.pullDataFromFile();
        return this.internalStore.getVerifyKey(chainInfo);
    }

    async saveKeyPair(keyPair: KeyPair): Promise<void> {
        await this.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        if (!this.exclusive) await this.lockFile(true);
        if (this.redTo === 0) this.redTo += await this.writeMagicNumber();
        const keyPairBuilder = new KeyPairBuilder();
        keyPairBuilder.setPublicKey(keyPair.publicKey);
        keyPairBuilder.setSecretKey(keyPair.secretKey.slice(0, 32));
        const logFragment = new LogFileBuilder();
        logFragment.setKeyPairsList([keyPairBuilder]);
        this.redTo += await this.writeLogFragment(logFragment, true);
        if (!this.exclusive) await this.unlockFile();
        unlockingFunction();
        await this.internalStore.saveKeyPair(keyPair);
    }

    async pullKeyPair(publicKey: Bytes): Promise<KeyPair> {
        return await this.internalStore.pullKeyPair(publicKey);
    }

    async saveSymmetricKey(symmetricKey: Bytes): Promise<number> {
        return await this.internalStore.saveSymmetricKey(symmetricKey);
    }

    async getSymmetricKey(keyId: number): Promise<Bytes> {
        await this.pullDataFromFile();
        return await this.internalStore.getSymmetricKey(keyId);
    }

    private async initializeLogBackedStore(): Promise<void> {
        await this.internalStore.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        await this.pullDataFromFile();
        const thisLogBackedStore = this;
        this.fileWatcher = watch(
            this.filename,
            async (eventType, _filename) => {
                await new Promise((r) => setTimeout(r, 10));
                if (thisLogBackedStore.closed || !thisLogBackedStore.opened)
                    return;
                let size: number = await thisLogBackedStore.getFileLength();
                if (eventType === "change" && size > this.redTo) {
                    const unlockingFunction =
                        await this.memoryLock.acquireLock();
                    if (!this.exclusive) await this.lockFile(true);

                    await this.pullDataFromFile();

                    if (!this.exclusive) await this.unlockFile();
                    unlockingFunction();
                }
            },
        );

        unlockingFunction();
        this.opened = true;
    }

    async close() {
        this.closed = true;
        if (this.fileWatcher) this.fileWatcher.close();
        if (this.fileLocked) await this.unlockFile().catch();
        if (this.fileHandle) await this.fileHandle.close().catch();
        if (this.internalStore) await this.internalStore.close().catch();
    }

    private async pullDataFromFile(): Promise<void> {
        if (this.closed) return;
        const totalSize = await this.getFileLength();
        if (this.redTo < totalSize) {
            const logFileBuilder = await this.getLogContents(
                this.redTo,
                totalSize,
            );
            if (this.redTo === 0) {
                ensure(
                    logFileBuilder.getMagicNumber() === 1263421767,
                    "log file doesn't have magic number",
                );
            }
            const claims: ClaimBuilder[] = logFileBuilder.getClaimsList();
            for (let i = 0; i < claims.length; i++) {
                this.claimedChains.set(claims[i].getMedallion(), {
                    medallion: claims[i].getMedallion(),
                    chainStart: claims[i].getChainStart(),
                    actorId: claims[i].getProcessId(),
                    claimTime: claims[i].getClaimTime(),
                });
            }
            const keyPairs: KeyPairBuilder[] = logFileBuilder.getKeyPairsList();
            for (let i = 0; i < keyPairs.length; i++) {
                const publicKey = keyPairs[i].getPublicKey_asU8()
                const secretKey = keyPairs[i].getSecretKey_asU8()
                this.internalStore.saveKeyPair({
                    publicKey,
                    secretKey: concatenate(secretKey, publicKey),
                });
            }
            const bundles = logFileBuilder.getBundlesList();
            for (const bundleBytes of bundles) {
                const bundle: BundleView = new Decomposition(bundleBytes);
                const added = await this.internalStore.addBundle(bundle);
                if (!added) throw new Error("unexpected not added");
                const info = bundle.info;
                const identity = bundle.builder.getIdentity();
                this.hasMap.markAsHaving(bundle.info);
                // This is the start of a chain, and we need to keep track of the identity.
                if (info.timestamp === info.chainStart && !info.priorTime) {
                    ensure(identity, "chain start bundle has no identity");
                    this.identities.set(
                        `${info.medallion},${info.chainStart}`,
                        identity,
                    );
                } else {
                    ensure(!identity, "non-chain-start bundle has identity");
                }
                for (const callback of this.foundBundleCallBacks) {
                    callback(bundle);
                }
                this.bundlesProcessed += 1;
            }
            this.redTo = totalSize;
        }
    }

    async getContainerProperties(
        containerMuid: Muid,
        asOf?: AsOf,
    ): Promise<Map<string, Value>> {
        await this.pullDataFromFile();
        return this.internalStore.getContainerProperties(containerMuid, asOf);
    }

    async getOrderedEntries(
        container: Muid,
        through = Infinity,
        asOf?: AsOf,
    ): Promise<Map<string, Entry>> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getOrderedEntries(container, through, asOf);
    }

    async getEntriesBySourceOrTarget(
        vertex: Muid,
        source: boolean,
        asOf?: AsOf,
    ): Promise<Entry[]> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getEntriesBySourceOrTarget(
            vertex,
            source,
            asOf,
        );
    }

    async getBundlesProcessed() {
        await this.ready;
        await this.pullDataFromFile();
        return this.bundlesProcessed;
    }

    async getLocation(entry: Muid, asOf?: AsOf): Promise<Placement> {
        await this.ready;
        await this.pullDataFromFile();
        return await this.internalStore.getLocation(entry, asOf);
    }

    async addBundle(
        bundle: BundleView,
        claimChain?: boolean,
    ): Promise<Boolean> {
        // TODO(https://github.com/x5e/gink/issues/182): delay unlocking the file to give better throughput
        await this.ready;
        let added = false;
        const unlockingFunction = await this.memoryLock.acquireLock();
        if (!this.exclusive) await this.lockFile(true);
        try {
            await this.pullDataFromFile();
            if (this.redTo === 0) this.redTo += await this.writeMagicNumber();
            const info: BundleInfo = bundle.info;
            added = await this.internalStore.addBundle(bundle);
            const identity = bundle.builder.getIdentity();
            if (identity) {
                this.identities.set(
                    `${info.medallion},${info.chainStart}`,
                    bundle.builder.getIdentity(),
                );
            }
            if (claimChain) {
                if (!added) throw new Error("can't claim chain on old bundle");
                await this.claimChain(
                    info.medallion,
                    info.chainStart,
                    getActorId(),
                );
            }
            this.hasMap.markAsHaving(info);
            if (added) {
                ensure(this.fileLocked);
                await this.pullDataFromFile();
                const logFragment = new LogFileBuilder();
                logFragment.setBundlesList([bundle.bytes]);
                this.redTo += await this.writeLogFragment(logFragment, true);
            }
        } finally {
            unlockingFunction();
            if (!this.exclusive) await this.unlockFile();
        }
        return added;
    }


    async acquireChain(identity: string): Promise<BundleInfo | null> {
        await this.ready;
        if (!this.exclusive) {
            await this.lockFile(true);
        }
        await this.pullDataFromFile();
        let found: BundleInfo | null = null;
        for (const claim of this.claimedChains.values()) {
            if (isAlive(claim.actorId))
                continue;  // don't want to conflict with a current process
            const medallion = claim.medallion;
            const chainStart = claim.chainStart;
            const chainId = this.identities.get(`${medallion},${chainStart}`);
            if (identity != chainId)
                continue; // don't want to step on someone else's toes
            await this.claimChain(medallion, chainStart, getActorId());
            found = this.hasMap.getBundleInfo([medallion, chainStart]);
            break;
        }
        await this.unlockFile();
        return found;
    }

    private async claimChain(
        medallion: Medallion,
        chainStart: ChainStart,
        actorId?: ActorId,
    ): Promise<ClaimedChain> {
        ensure(this.fileLocked, "file not locked?");
        const claimTime = generateTimestamp();
        const fragment = new LogFileBuilder();
        const claim = new ClaimBuilder();
        claim.setChainStart(chainStart);
        claim.setMedallion(medallion);
        claim.setProcessId(actorId);
        claim.setClaimTime(claimTime);
        fragment.setClaimsList([claim]);
        this.redTo += await this.writeLogFragment(fragment);
        const chain = {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime,
        };
        this.claimedChains.set(medallion, chain);
        return chain;
    }

    async getChainIdentity(
        chainInfo: [Medallion, ChainStart],
    ): Promise<string> {
        await this.ready;
        await this.pullDataFromFile();
        return this.identities.get(`${chainInfo[0]},${chainInfo[1]}`);
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        await this.pullDataFromFile();
        return await this.internalStore.getChainTracker();
    }

    async getBundles(callBack: (bundle: BundleView) => void): Promise<void> {
        await this.ready;
        await this.pullDataFromFile();
        await this.internalStore.getBundles(callBack);
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getContainerBytes(address);
    }

    async getEntryByKey(
        container?: Muid,
        key?: ScalarKey,
        asOf?: AsOf,
    ): Promise<Entry | undefined> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getEntryByKey(container, key, asOf);
    }

    async getKeyedEntries(
        container: Muid,
        asOf?: AsOf,
    ): Promise<Map<string, Entry>> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getKeyedEntries(container, asOf);
    }

    async getEntryById(
        entryMuid: Muid,
        asOf?: AsOf,
    ): Promise<Entry | undefined> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getEntryById(entryMuid, asOf);
    }

    async getAllEntries(): Promise<Entry[]> {
        await this.ready;
        await this.pullDataFromFile();
        return this.internalStore.getAllEntries();
    }

    async getContainersByName(name: string, asOf?: AsOf): Promise<Muid[]> {
        await this.ready;
        await this.pullDataFromFile();
        return await this.internalStore.getContainersByName(name, asOf);
    }

    async getAllContainerTuples(): Promise<MuidTuple[]> {
        await this.ready;
        await this.pullDataFromFile();
        return await this.internalStore.getAllContainerTuples();
    }

    /**
     * Add a callback if you want another function to run when a new
     * bundle is pulled from the log file.
     * @param callback a function to be called when a new bundle has been
     * received from the log file. It needs to take one argument, bundleInfo
     */
    addFoundBundleCallBack(callback: BroadcastFunc) {
        this.foundBundleCallBacks.push(callback);
    }
}
