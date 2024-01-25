import { BundleBytes, Medallion, ChainStart, SeenThrough, Bytes, AsOf, KeyType, ClaimedChain } from "./typedefs";
import { BundleInfo, Muid, Entry, CallBack } from "./typedefs";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { FileHandle, open } from "fs/promises";

import { flock } from "fs-ext";
import { ChainTracker } from "./ChainTracker";
import { ChainEntryBuilder, LogFileBuilder } from "./builders";

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
    private indexedDbStore: IndexedDbStore;
    private chainTracker: ChainTracker = new ChainTracker({});
    private chainEntries: ChainEntryBuilder[];
    private locked: boolean = false;

    async close() {
        await this.ready.catch();
        await this.fileHandle.close().catch();
        await this.indexedDbStore.close().catch();
    }

    /**
     *
     * @param filename file to store transactions and chain ownership information
     * @param hold_lock if true, lock the file until closing store, otherwise only lock as-needed.
     */
    constructor(readonly filename: string, readonly hold_lock: boolean = false) {
        this.ready = this.initialize();
    }

    private async lock(block: boolean): Promise<boolean> {
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, (block ? "exnb" : "ex"), async (err) => {
                if (err) {
                    return reject(err);
                }
                resolve(true);
            });
        });
    }

    private async initialize(): Promise<void> {
        this.fileHandle = await open(this.filename, "a+");
        if (this.hold_lock) {
            this.locked = await this.lock(false);
        }

        // Assuming we have the lock, clear the in memory store and then re-populate it.
        this.indexedDbStore = new IndexedDbStore(this.filename, true);
        await this.indexedDbStore.ready;

        const stats = await this.fileHandle.stat();
        const size = stats.size;
        if (size) {
            const uint8Array = new Uint8Array(size);
            await this.fileHandle.read(uint8Array, 0, size, 0);
            const logFileBuilder = <LogFileBuilder>LogFileBuilder.deserializeBinary(uint8Array);
            const commits = logFileBuilder.getCommitsList();
            for (const commit of commits) {
                const info = await this.indexedDbStore.addBundle(commit);
                this.chainTracker.markAsHaving(info)
                this.commitsProcessed += 1;
            }
            this.chainEntries = logFileBuilder.getChainEntriesList();
        }
    }

    async getOrderedEntries(container: Muid, through = Infinity, asOf?: AsOf): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getOrderedEntries(container, through, asOf);
    }

    async getEntriesBySourceOrTarget(vertex: Muid, source: boolean, asOf?: AsOf): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getEntriesBySourceOrTarget(vertex, source, asOf);
    }

    async getCommitsProcessed() {
        await this.ready;
        return this.commitsProcessed;
    }

    async addBundle(commitBytes: BundleBytes): Promise<BundleInfo> {
        return this.ready.then(() => {
            return this.indexedDbStore.addBundle(commitBytes).then((info) => {
                const added = this.chainTracker.markAsHaving(info);
                if (added) {
                    const logFragment = new LogFileBuilder();
                    logFragment.setCommitsList([commitBytes]);
                    return this.fileHandle.appendFile(logFragment.serializeBinary()).then(() => info);
                }
                return Promise.resolve(info);
            });
        });
    }

    async getClaimedChains() {
        await this.ready;
        return this.indexedDbStore.getClaimedChains();
    }

    async claimChain(medallion: Medallion, chainStart: ChainStart, processId: number): Promise<ClaimedChain> {
        await this.ready;
        await this.lock(true);
        await this.indexedDbStore.claimChain(medallion, chainStart, processId);
        const fragment = new LogFileBuilder();
        const entry = new ChainEntryBuilder();
        entry.setChainStart(chainStart);
        entry.setMedallion(medallion);
        entry.setProcessId(process.pid)
        fragment.setChainEntriesList([entry]);
        await this.fileHandle.appendFile(fragment.serializeBinary());
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        return await this.indexedDbStore.getChainTracker();
    }

    async getCommits(callBack: (commitBytes: BundleBytes, commitInfo: BundleInfo) => void): Promise<void> {
        await this.ready;
        await this.indexedDbStore.getCommits(callBack);
    }

    async getContainerBytes(address: Muid): Promise<Bytes | undefined> {
        await this.ready;
        return this.indexedDbStore.getContainerBytes(address);
    }

    async getEntryByKey(container?: Muid, key?: KeyType, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.indexedDbStore.getEntryByKey(container, key, asOf);
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        await this.ready;
        return this.indexedDbStore.getKeyedEntries(container, asOf);
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getBackRefs(pointingTo);
    }

    async getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.indexedDbStore.getEntryById(entryMuid, asOf);
    }

    async getAllEntries(): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getAllEntries();
    }
}
