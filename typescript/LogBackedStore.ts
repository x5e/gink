import { CommitBytes, HasMap, CommitInfo, ActiveChains, Medallion, ChainStart } from "./typedefs";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
//import { FileHandle, open } from "fs/promises"; // broken on node-12 ???
const promises = require("fs").promises;
type FileHandle = any;
const open = promises.open;
import { flock } from "fs-ext";
import { LogFile } from "log_pb";

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

    readonly initialized: Promise<void>;
    #commitsProcessed: number = 0;
    #fileHandle: FileHandle;
    #indexedDbStore: IndexedDbStore;

    constructor(filename: string, reset = false) {
        if (globalThis.debugging)
            console.log(`creating LogBackedStore ${filename}, reset=${reset}`)
        this.initialized = this.#initialize(filename, reset);
    }

    async #openAndLock(filename: string, truncate?: boolean): Promise<FileHandle> {
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

    async #initialize(filename: string, reset: boolean): Promise<void> {

        // Try (and maybe fail) to get a lock on the file before resetting the in-memory store,
        // so that we don't mess things up if another LogBackedStore has this file open.
        this.#fileHandle = await this.#openAndLock(filename, reset);

        // Assuming we have the lock, clear the in memory store and then re-populate it.
        this.#indexedDbStore = new IndexedDbStore(filename, true);
        await this.#indexedDbStore.initialized;

        if (!reset) {
            const stats = await this.#fileHandle.stat();
            const size = stats.size;
            if (size) {
                const uint8Array = new Uint8Array(size);
                await this.#fileHandle.read(uint8Array, 0, size, 0);
                const logFile = LogFile.deserializeBinary(uint8Array);
                const trxns = logFile.getCommitsList();
                for (const trxn of trxns) {
                    const added = !!(await this.#indexedDbStore.addCommit(trxn));
                    this.#commitsProcessed += added ? 1 : 0;
                }
                const chainEntries = logFile.getChainEntriesList();
                for (const entry of chainEntries) {
                    await this.#indexedDbStore.activateChain(entry.getMedallion(), entry.getChainStart());
                }
            }
        }
    }

    async getCommitsProcessed() {
        await this.initialized;
        return this.#commitsProcessed;
    }

    async addCommit(trxn: CommitBytes): Promise<CommitInfo|null> {
        await this.initialized;
        const added = await this.#indexedDbStore.addCommit(trxn);
        if (added) {
            const logFragment = new LogFile();
            logFragment.setCommitsList([trxn]);
            await this.#fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
    }

    async getActiveChains() {
        await this.initialized;
        return this.#indexedDbStore.getActiveChains();
    }

    async activateChain(medallion: Medallion, chainStart: ChainStart): Promise<void> {
        await this.initialized;
        const fragment = new LogFile();
        const entry = new LogFile.ChainEntry();
        entry.setChainStart(chainStart);
        entry.setMedallion(medallion);
        fragment.setChainEntriesList([entry]);
        await this.#fileHandle.appendFile(fragment.serializeBinary());
        await this.#indexedDbStore.activateChain(medallion, chainStart);
    }
    
    async getHasMap(): Promise<HasMap> {
        await this.initialized;
        return await this.#indexedDbStore.getHasMap();
    }

    async getNeededCommits(
        callBack: (commitBytes: CommitBytes, commitInfo: CommitInfo) => void,
        hasMap?: HasMap): Promise<HasMap> {
        await this.initialized;
        return await this.#indexedDbStore.getNeededCommits(callBack, hasMap);
    }

    async close() {
        await this.initialized;
        await this.#fileHandle.close();
        await this.#indexedDbStore.close();
    }
}
