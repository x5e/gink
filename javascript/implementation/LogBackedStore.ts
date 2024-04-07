import {
    BundleBytes,
    Medallion,
    ChainStart,
    Bytes,
    AsOf,
    KeyType,
    ClaimedChain,
    ActorId,
    BroadcastFunc,
} from "./typedefs";
import { BundleInfo, Muid, Entry } from "./typedefs";
import { MemoryStore } from "./MemoryStore";
import { Store } from "./Store";
import { PromiseChainLock } from "./PromiseChainLock";

import { watch, FSWatcher } from "fs";
import { ChainTracker } from "./ChainTracker";
import { ClaimBuilder, LogFileBuilder } from "./builders";
import { generateTimestamp, ensure } from "./utils";
import { LockableLog } from "./LockableLog";

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
    private memoryLock: PromiseChainLock = new PromiseChainLock();
    private redTo: number = 0;
    private fileWatcher: FSWatcher;
    private foundBundleCallBacks: BroadcastFunc[] = [];

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

        this.fileWatcher =
            watch(this.filename, async (eventType, filename) => {
                await new Promise(r => setTimeout(r, 10));
                const size = (await this.fileHandle.stat()).size;
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
    }

    async close() {
        this.fileWatcher.close();
        await new Promise(r => setTimeout(r, 100));
        await this.ready.catch();
        await this.fileHandle.close().catch();
        await this.internalStore.close().catch();
    }

    private async pullDataFromFile(): Promise<void> {
        const stats = await this.fileHandle.stat();
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

    async getOrderedEntries(container: Muid, through = Infinity, asOf?: AsOf): Promise<Entry[]> {
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

    async addBundle(commitBytes: BundleBytes): Promise<BundleInfo> {
        // TODO(https://github.com/x5e/gink/issues/182): delay unlocking the file to give better throughput
        await this.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        if (!this.exclusive)
            await this.lockFile(true);
        await this.pullDataFromFile();
        const info: BundleInfo = await this.internalStore.addBundle(commitBytes);
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

    async claimChain(medallion: Medallion, chainStart: ChainStart, actorId?: ActorId): Promise<ClaimedChain> {
        await this.ready;
        const unlockingFunction = await this.memoryLock.acquireLock();
        if (!this.exclusive) {
            await this.lockFile(true);
        }
        ensure(this.fileLocked);
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
        if (!this.exclusive)
            await this.unlockFile();
        unlockingFunction();
        return {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime,
        };
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

    async getEntryByKey(container?: Muid, key?: KeyType, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.internalStore.getEntryByKey(container, key, asOf);
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        await this.ready;
        return this.internalStore.getKeyedEntries(container, asOf);
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        await this.ready;
        return this.internalStore.getBackRefs(pointingTo);
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
