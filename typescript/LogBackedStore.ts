import { CommitBytes, HasMap, CommitInfo } from "./typedefs";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { Log as TransactionLog } from "messages_pb";
//import { FileHandle, open } from "fs/promises"; // broken on node-12 ???
const promises = require("fs").promises;
type FileHandle = any;
const open = promises.open;
import { flock } from "fs-ext";

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
        this.initialized = this.#initialize(filename, reset);
    }

    async #openAndLock(filename: string): Promise<FileHandle> {
        return new Promise(async (resolve, reject) => {
            const fh = await open(filename, "a+");
            flock(fh.fd, "exnb", async (err) => {
                if (err) return reject(err);
                resolve(fh);
            });
        });
    }

    async #initialize(filename: string, reset: boolean): Promise<void> {
        this.#indexedDbStore = new IndexedDbStore(filename, reset);
        await this.#indexedDbStore.initialized;

        // TODO: probably should get an exclusive lock on the file
        this.#fileHandle = await this.#openAndLock(filename);
        if (reset) {
            await this.#fileHandle.truncate();
        } else {
            const stats = await this.#fileHandle.stat();
            const size = stats.size;
            if (size) {
                const uint8Array = new Uint8Array(size);
                await this.#fileHandle.read(uint8Array, 0, size, 0);
                const trxns = TransactionLog.deserializeBinary(uint8Array).getTransactionsList();
                for (const trxn of trxns) {
                    const added = !!(await this.#indexedDbStore.addCommit(trxn));
                    this.#commitsProcessed += added ? 1 : 0;
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
            const logFragment = new TransactionLog();
            logFragment.setCommitsList([trxn]);
            await this.#fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
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
