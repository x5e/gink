import { ChangeSetBytes, Medallion, ChainStart, SeenThrough, Bytes, AsOf } from "./typedefs";
import { ChangeSetInfo, Muid, Entry, CallBack } from "./typedefs";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
//import { FileHandle, open } from "fs/promises"; // broken on node-12 ???
const promises = require("fs").promises;
type FileHandle = any;
const open = promises.open;
import { flock } from "fs-ext";
import { LogFile } from "gink/protoc.out/log_file_pb";
import { assert } from "console";
import { ChainTracker } from "./ChainTracker";

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
    private commitsProcessed: number = 0;
    private fileHandle: FileHandle;
    private indexedDbStore: IndexedDbStore;

    constructor(filename: string, reset = false, protected logger: CallBack = (() => null)) {
        this.ready = this.initialize(filename, reset);
    }

    private async openAndLock(filename: string, truncate?: boolean): Promise<FileHandle> {
        return new Promise(async (resolve, reject) => {
            const fh = await open(filename, "a+");
            // It's better to truncate rather than unlink, because an unlink could result
            // in two instances thinking that they have a lock on the same file.
            if (truncate) await fh.truncate();
            flock(fh.fd, "exnb", async (err) => {
                if (err) return reject(err);
                resolve(fh);
            });
        });
    }

    private async initialize(filename: string, reset: boolean): Promise<void> {

        // Try (and maybe fail) to get a lock on the file before resetting the in-memory store,
        // so that we don't mess things up if another LogBackedStore has this file open.
        this.fileHandle = await this.openAndLock(filename, reset);

        // Assuming we have the lock, clear the in memory store and then re-populate it.
        this.indexedDbStore = new IndexedDbStore(filename, true);
        await this.indexedDbStore.ready;

        if (!reset) {
            const stats = await this.fileHandle.stat();
            const size = stats.size;
            if (size) {
                const uint8Array = new Uint8Array(size);
                await this.fileHandle.read(uint8Array, 0, size, 0);
                const logFile = LogFile.deserializeBinary(uint8Array);
                const commits = logFile.getCommitsList();
                for (const commit of commits) {
                    const added = await this.indexedDbStore.addChangeSet(commit);
                    assert(added);
                    this.commitsProcessed += 1;
                }
                const chainEntries = logFile.getChainEntriesList();
                for (const entry of chainEntries) {
                    await this.indexedDbStore.claimChain(entry.getMedallion(), entry.getChainStart());
                }
            }
        }
        this.logger(`LogBackedStore.ready`);
    }

    async getOrderedEntries(container: Muid, through: number=Infinity, asOf?: AsOf): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getOrderedEntries(container, through, asOf);
    }


    async getCommitsProcessed() {
        await this.ready;
        return this.commitsProcessed;
    }

    async addChangeSet(commitBytes: ChangeSetBytes): Promise<ChangeSetInfo|undefined> {
        await this.ready;
        const added = await this.indexedDbStore.addChangeSet(commitBytes);
        if (added) {
            const logFragment = new LogFile();
            logFragment.setCommitsList([commitBytes]);
            await this.fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
    }

    async getClaimedChains() {
        await this.ready;
        return this.indexedDbStore.getClaimedChains();
    }

    async getSeenThrough(key: [Medallion, ChainStart]): Promise<SeenThrough> {
        await this.ready;
        return this.indexedDbStore.getSeenThrough(key);
    }

    async claimChain(medallion: Medallion, chainStart: ChainStart): Promise<void> {
        await this.ready;
        const fragment = new LogFile();
        const entry = new LogFile.ChainEntry();
        entry.setChainStart(chainStart);
        entry.setMedallion(medallion);
        fragment.setChainEntriesList([entry]);
        await this.fileHandle.appendFile(fragment.serializeBinary());
        await this.indexedDbStore.claimChain(medallion, chainStart);
    }

    async getChainTracker(): Promise<ChainTracker> {
        await this.ready;
        return await this.indexedDbStore.getChainTracker();
    }

    async getCommits(callBack: (commitBytes: ChangeSetBytes, commitInfo: ChangeSetInfo) => void): Promise<void> {
        await this.ready;
        await this.indexedDbStore.getCommits(callBack);
    }

    async getContainerBytes(address: Muid): Promise<Bytes|undefined> {
        await this.ready;
        return this.indexedDbStore.getContainerBytes(address);
    }

    async getEntry(container?: Muid, key?: KeyType|Muid, asOf?: AsOf): Promise<Entry | undefined> {
        await this.ready;
        return this.indexedDbStore.getEntry(container, key, asOf);
    }

    async getKeyedEntries(container: Muid, asOf?: AsOf): Promise<Map<KeyType,Entry>> {
        await this.ready;
        return this.getKeyedEntries(container, asOf);
    }

    async getBackRefs(pointingTo: Muid): Promise<Entry[]> {
        await this.ready;
        return this.indexedDbStore.getBackRefs(pointingTo);
    }

    async close() {
        await this.ready;
        await this.fileHandle.close();
        await this.indexedDbStore.close();
    }
}
