import {
    BundleBytes,
    Medallion,
    ChainStart,
    Bytes,
    AsOf,
    KeyType,
    ClaimedChain,
    ActorId,
} from "./typedefs";
import { BundleInfo, Muid, Entry } from "./typedefs";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { FileHandle, open } from "fs/promises";

import { flock } from "fs-ext";
import { ChainTracker } from "./ChainTracker";
import { ChainEntryBuilder, LogFileBuilder } from "./builders";
import { generateTimestamp, ensure } from "./utils";

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

export class LogBackedStore implements Store {

    readonly ready: Promise<void>;
    private commitsProcessed = 0;
    private fileHandle: FileHandle;
    private chainTracker: ChainTracker = new ChainTracker({});
    private claimedChains: ClaimedChain[] = [];
    private locked: boolean = false;
    private redTo: number = 0;

    /**
     *
     * @param filename file to store transactions and chain ownership information
     * @param exclusive if true, lock the file until closing store, otherwise only lock as-needed.
     */
    constructor(
        readonly filename: string,
        readonly exclusive: boolean = false,
        private internalStore = new IndexedDbStore(),
        ) {
        this.ready = this.initialize();
    }

    async close() {
        await this.ready.catch();
        await this.fileHandle.close().catch();
        await this.internalStore.close().catch();
    }

    private async lock(block: boolean): Promise<boolean> {
        const thisLogBackedStore = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, (block ? "ex": "exnb"), (err) => {
                if (err) {
                    return reject(err);
                }
                thisLogBackedStore.locked = true;
                resolve(true);
            });
        });
    }

    private async unlock(): Promise<boolean> {
        const thisLogBackedStore = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, ("un"), async (err) => {
                if (err) {
                    return reject(err);
                }
                thisLogBackedStore.locked = false;
                resolve(true);
            });
        });
    }

    private async pullDataFromFile(): Promise<void> {
        const stats = await this.fileHandle.stat();
        const totalSize = stats.size;
        console.error(`totalSize=${totalSize}`);
        if (this.redTo < totalSize) {
            const needToReed = totalSize - this.redTo;
            const uint8Array = new Uint8Array(needToReed);
            await this.fileHandle.read(uint8Array, 0, needToReed);
            const logFileBuilder = <LogFileBuilder>LogFileBuilder.deserializeBinary(uint8Array);
            const commits = logFileBuilder.getCommitsList();
            for (const commit of commits) {
                const info = await this.internalStore.addBundle(commit);
                this.chainTracker.markAsHaving(info)
                this.commitsProcessed += 1;
            }
            const chainEntries: ChainEntryBuilder[] = logFileBuilder.getChainEntriesList();
            for (let i=0;i<chainEntries.length;i++) {
                this.claimedChains.push({
                    medallion: chainEntries[i].getMedallion(),
                    chainStart: chainEntries[i].getChainStart(),
                    actorId: chainEntries[i].getProcessId(),
                    claimTime: chainEntries[i].getClaimTime(),
                });
            }
            this.redTo = totalSize;
        }
    }

    private async initialize(): Promise<void> {
        await this.internalStore.ready;
        this.fileHandle = await open(this.filename, "a+");
        if (this.exclusive) {
            await this.lock(false);
        }
        await this.pullDataFromFile();
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
        await this.ready;
        if (!this.exclusive)
            await this.lock(true);
        const info: BundleInfo = await this.internalStore.addBundle(commitBytes);
        const added = this.chainTracker.markAsHaving(info);
        if (added) {
            ensure(this.locked);
            await this.pullDataFromFile();
            const logFragment = new LogFileBuilder();
            logFragment.setCommitsList([commitBytes]);
            await this.fileHandle.appendFile(logFragment.serializeBinary());
        }
        if (!this.exclusive)
            await this.unlock();
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
        if (! this.exclusive) {
            await this.lock(true);
        }
        ensure(this.locked);
        const claimTime = generateTimestamp();
        const fragment = new LogFileBuilder();
        const entry = new ChainEntryBuilder();
        entry.setChainStart(chainStart);
        entry.setMedallion(medallion);
        entry.setProcessId(actorId);
        entry.setClaimTime(claimTime);
        fragment.setChainEntriesList([entry]);
        await this.fileHandle.appendFile(fragment.serializeBinary());
        if (! this.exclusive)
            await this.unlock();
        return {
            medallion,
            chainStart,
            actorId: actorId || 0,
            claimTime,
        }
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
}
