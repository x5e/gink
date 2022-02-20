import { GinkTrxnBytes, GreetingBytes, HasMap } from "./typedefs";
import { IndexedDbGinkStore } from "./IndexedDbGinkStore";
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

export class LogBackedGinkStore extends IndexedDbGinkStore {

    #fileHandle: FileHandle;
    readonly initialized: Promise<void>;

    constructor(filename: string, reset = false, indexedDbName = "gink") {
        super(indexedDbName, reset);
        this.initialized = this.#initialize(filename, reset);
    }

    async #initialize(filename: string, reset: boolean): Promise<void> {
        let count: number = 0;
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
                    // Use the super method to avoid rewriting the trxn to the log file.
                    count += !!(await super.addTransaction(trxn)) ? 1 : 0;
                }
            }
        }
    }

    async addTransaction(trxn: GinkTrxnBytes): Promise<boolean> {
        await this.initialized;
        const added = await super.addTransaction(trxn);
        if (added) {
            const logFragment = new TransactionLog();
            logFragment.setTransactionsList([trxn]);
            await this.#fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
    }

    async getGreeting(): Promise<GreetingBytes> {
        await this.initialized;
        return await super.getGreeting();
    }

    async getNeededTransactions(
        callBack: (x: GinkTrxnBytes) => void,
        greeting: Uint8Array | null = null): Promise<HasMap> {
        await this.initialized;
        return await super.getNeededTransactions(callBack, greeting);
    }

    async close() {
        await this.initialized;
        await this.#fileHandle.close();
        await super.close();
    }
}
