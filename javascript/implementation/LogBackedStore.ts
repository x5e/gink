import {
    BundleBytes,
    Medallion,
    ChainStart,
    Bytes,
    AsOf,
    ScalarKey,
    ClaimedChain,
    ActorId,
    BroadcastFunc,
} from "./typedefs";
import { BundleInfo, Muid, Entry } from "./typedefs";
import { MemoryStore } from "./MemoryStore";
import { Store } from "./Store";
import { PromiseChainLock } from "./PromiseChainLock";
import { LockableLog } from "./LockableLog";
import { flock } from "fs-ext";
import { watch, FSWatcher, Stats } from "fs";
import { ChainTracker } from "./ChainTracker";
import { ClaimBuilder, LogFileBuilder } from "./builders";
import { generateTimestamp, ensure, getActorId } from "./utils";


/*
    At time of writing, there's only an in-memory implementation of
    IndexedDB available for Node.js.  This subclass will append all
    transactions it receives to a log file, making it possible to
    recreate the same in-memory database in the future by simply
    replaying the receipt of each commit.

    This is obviously not ideal; eventually want to move to either
    a durable server side indexedDB implementation or create an
    implementation of Store using some other system (e.g. LMDB).
*/

export class LogBackedStore extends LockableLog implements Store {


    private commitsProcessed = 0;
    private chainTracker: ChainTracker = new ChainTracker({});
    private claimedChains: ClaimedChain[] = [];
    private identities: Map<string, string> = new Map(); // Medallion,ChainStart => identity

    private memoryLock: PromiseChainLock = new PromiseChainLock();
    private redTo: number = 0;
    private fileWatcher: FSWatcher;
    private foundBundleCallBacks: BroadcastFunc[] = [];
    private opened: boolean = false;
    private closed: boolean = false;

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
        this.ready = this.ready.then(() => this.initialize());
    }

    private async initialize(): Promise<void> {
        await this.internalStore.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        await this.pullDataFromFile();
        const thisLogBackedStore = this;
        this.fileWatcher =
            watch(this.filename, async (eventType, filename) => {
                await new Promise(r => setTimeout(r, 10));
                if (thisLogBackedStore.closed || !thisLogBackedStore.opened)
                    return;
                let size: number;
                try {
                    size = (await this.fileHandle.stat()).size;
                } catch (problem) {
                    console.error(`problem getting size! ${problem}`);
                    throw problem;
                }
                if (eventType == "change" && size > this.redTo) {
                    const unlockingFunction = await this.memoryLock.acquireLock();
                    if (!this.exclusive)
                        await this.lockFile(true);

                    await this.pullDataFromFile();

                    if (!this.exclusive)
                        await this.unlockFile();
                    unlockingFunction();
                }
            });

        unlockingFunction();
        this.opened = true;
    }

    async close() {
        this.closed = true;
        if (this.fileWatcher)
            this.fileWatcher.close();
        if (this.fileHandle)
            await this.fileHandle.close().catch();
        if (this.internalStore)
            await this.internalStore.close().catch();
    }

    private async pullDataFromFile(): Promise<void> {
        if (this.closed)
            return;
        let stats: Stats
        try {
            stats = await this.fileHandle.stat();
        } catch (problem) {
            console.error(`problem with fileHandle.stat ${problem}`);
            throw problem;
        }
        const totalSize = stats.size;
        if (this.redTo < totalSize) {
            const needToReed = totalSize - this.redTo;
            const uint8Array = new Uint8Array(needToReed);
            await this.fileHandle.read(uint8Array, 0, needToReed, this.redTo);
            const logFileBuilder = <LogFileBuilder>LogFileBuilder.deserializeBinary(uint8Array);
            const commits = logFileBuilder.getCommitsList();
            for (const commit of commits) {
                const info = await this.internalStore.addBundle(commit);
                this.chainTracker.markAsHaving(info);
                // This is the start of a chain, and we need to keep track of the identity.
                if (info.timestamp == info.chainStart && !info.priorTime) {
                    this.identities.set(`${info.medallion},${info.chainStart}`, info.comment);
                }
                for (const callback of this.foundBundleCallBacks) {
                    callback(commit, info);
                }
                this.commitsProcessed += 1;
            }
            const claims: ClaimBuilder[] = logFileBuilder.getClaimsList();
            for (let i = 0; i < claims.length; i++) {
                this.claimedChains.push({
                    medallion: claims[i].getMedallion(),
                    chainStart: claims[i].getChainStart(),
                    actorId: claims[i].getProcessId(),
                    claimTime: claims[i].getClaimTime(),
                });
            }
            this.redTo = totalSize;
        }
    }

    async getOrderedEntries(container: Muid, through = Infinity, asOf?: AsOf): Promise<Map<string,Entry>> {
        await this.ready;
        return this.internalStore.getOrderedEntries(container, through, asOf);
    }

    async getEntriesBySourceOrTarget(vertex: Muid, source: boolean, asOf?: AsOf): Promise<Entry[]> {
        await this.ready;
        return this.internalStore.getEntriesBySourceOrTarget(vertex, source, asOf);
    }

    async getCommitsProcessed() {
        await this.ready;
        return this.commitsProcessed;
    }

    async addBundle(commitBytes: BundleBytes, claimChain?: boolean): Promise<BundleInfo> {
        // TODO(https://github.com/x5e/gink/issues/182): delay unlocking the file to give better throughput
        await this.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        if (!this.exclusive)
            await this.lockFile(true);

        await this.pullDataFromFile();
        const info: BundleInfo = await this.internalStore.addBundle(commitBytes);
        if (claimChain) {
            await this.claimChain(info.medallion, info.chainStart, getActorId());
            if (info.timestamp == info.chainStart && !info.priorTime) {
                this.identities.set(`${info.medallion},${info.chainStart}`, info.comment);
            }
        }
        const added = this.chainTracker.markAsHaving(info);
        if (added) {
            ensure(this.fileLocked);
            await this.pullDataFromFile();
            const logFragment = new LogFileBuilder();
            logFragment.setCommitsList([commitBytes]);
            const bytes: Uint8Array = logFragment.serializeBinary();
            await this.fileHandle.writeFile(bytes);
            await this.fileHandle.sync();
            this.redTo += bytes.byteLength;
        }
        if (!this.exclusive)
            await this.unlockFile();
        unlockingFunction();
        return info;
    }

    async getClaimedChains(): Promise<Map<Medallion, ClaimedChain>> {
        await this.ready;
        const result = new Map();
        for (let chain of this.claimedChains) {
            result.set(chain.medallion, chain);
        }
        return result;
    }

    private async claimChain(medallion: Medallion, chainStart: ChainStart, actorId?: ActorId): Promise<ClaimedChain> {
        await this.ready;
        await this.pullDataFromFile();
        const claimTime = generateTimestamp();
        const fragment = new LogFileBuilder();
        const claim = new ClaimBuilder();
        claim.setChainStart(chainStart);
        claim.setMedallion(medallion);
        claim.setProcessId(actorId);
        claim.setClaimTime(claimTime);
        fragment.setClaimsList([claim]);
        const bytes: Uint8Array = fragment.serializeBinary();
        await this.fileHandle.appendFile(bytes);
        await this.fileHandle.sync();
        this.redTo += bytes.byteLength;
        const chain = {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime,
        };
        this.claimedChains.push(chain);
        return chain;
    }

    async getChainIdentity(chainInfo: [Medallion, ChainStart]): Promise<string> {
        await this.ready;
        return this.identities.get(`${chainInfo[0]},${chainInfo[1]}`);
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        return await this.internalStore.getChainTracker();
    }

    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void): Promise<void> {
        await this.ready;
        await this.internalStore.getCommits(callBack);
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        await this.ready;
        return this.internalStore.getContainerBytes(address);
    }

    async getEntryByKey(container?: Muid, key?: ScalarKey, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.internalStore.getEntryByKey(container, key, asOf);
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<string, Entry>> {
        await this.ready;
        return this.internalStore.getKeyedEntries(container, asOf);
    }

    async getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.internalStore.getEntryById(entryMuid, asOf);
    }

    async getAllEntries(): Promise<Entry[]> {
        await this.ready;
        return this.internalStore.getAllEntries();
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
