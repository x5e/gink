import { CommitBytes, GreetingBytes, HasMap, CommitInfo } from "./typedefs";
import { IndexedDbGinkStore } from "./IndexedDbGinkStore";
import { GinkStore } from "./GinkStore";
import { Log as TransactionLog } from "messages_pb";
//import { FileHandle, open } from "fs/promises"; // broken on node-12 ???
const promises = require("fs").promises;
type FileHandle = any;

/*
    At time of writing, there's only an in-memory implementation of 
    IndexedDB available for Node.js.  This subclass will append all
    transactions it receives to a log file, making it possible to
    recreate the same in-memory database in the future by simply
    replaying the receipt of each gink commit.

    This is obviously not ideal; eventually want to move to either 
    a durable server side indexedDB implementation or create an
    implementation of GinkStore using some other system (e.g. LMDB).
*/

export class LogBackedGinkStore implements GinkStore {

    readonly initialized: Promise<void>;
    #commitsProcessed: number = 0;
    #fileHandle: FileHandle;
    #indexedDbGinkStore: IndexedDbGinkStore;

    constructor(filename: string, reset = false) {
        this.initialized = this.#initialize(filename, reset);
    }

    async #initialize(filename: string, reset: boolean): Promise<void> {
        this.#indexedDbGinkStore = new IndexedDbGinkStore(filename, reset);
        await this.#indexedDbGinkStore.initialized;

        // TODO: probably should get an exclusive lock on the file
        this.#fileHandle = await promises.open(filename, "a+");
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
                    const added = !!(await this.#indexedDbGinkStore.addCommit(trxn));
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
        const added = await this.#indexedDbGinkStore.addCommit(trxn);
        if (added) {
            const logFragment = new TransactionLog();
            logFragment.setCommitsList([trxn]);
            await this.#fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
    }

    async getGreeting(): Promise<GreetingBytes> {
        await this.initialized;
        return await this.#indexedDbGinkStore.getGreeting();
    }
    
    async getHasMap(): Promise<HasMap> {
        await this.initialized;
        return await this.#indexedDbGinkStore.getHasMap();
    }

    async getNeededCommits(
        callBack: (commitBytes: CommitBytes, commitInfo: CommitInfo) => void,
        hasMap?: HasMap): Promise<HasMap> {
        await this.initialized;
        return await this.#indexedDbGinkStore.getNeededCommits(callBack, hasMap);
    }

    async close() {
        await this.initialized;
        await this.#fileHandle.close();
        await this.#indexedDbGinkStore.close();
    }
}
