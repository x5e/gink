import { GinkTrxnBytes, GreetingBytes, HasMap } from "./GinkStore";
import { IndexedDbGinkStore } from "./IndexedDbGinkStore";
import { Log as TransactionLog } from "messages_pb";
//import { FileHandle, open } from "fs/promises"; // broken on node-12
var promises = require("fs").promises;

/*
    At time of writing, there's only an in-memory implementation of 
    IndexedDB available for Node.js.  This subclass will write all
    transactions it receives to a log file, making it possible to
    recreate the same in-memory database in the future by simply
    replaying the receipt of each transaction entry.

    This is obviously not ideal; eventually want to move to a 
    durable indexedDB implementation (when I can find/write one).
*/

export class IndexedDbWithLogGinkStore extends IndexedDbGinkStore {

    // Promise<promises.FileHandle> doesn't work, not sure why.
    #pFileHandle: Promise<any>;
    #initialized: boolean;

    constructor(filename: string, indexedDbName = "gink") {
        super(indexedDbName);
        // TODO: probably should get an exclusive lock on the file        
        this.#pFileHandle = promises.open(filename, "a+");
        this.#initialized = false;
    }

    /**
     * (Re-)reads the log file and trys to adds each transaction
     * to the underlying IndexedGink instance.  Run implicitly 
     * (if it hasn't run yet) when any GinkStore method is called.
     * @returns number of transactions read
     */
    async readLog(): Promise<number> {
        // Currently this implementation reads all transactions into memory,
        // which probably should be changed to reading incrementally.
        const fileHandle = await this.#pFileHandle;
        const stats = await fileHandle.stat();
        const size = stats.size;
        const uint8Array = new Uint8Array(size);
        await fileHandle.read(uint8Array, 0, size, 0);
        const trxns = TransactionLog.deserializeBinary(uint8Array).getTransactionsList();
        let count: number = 0;
        for (const trxn of trxns) {
            // Use the super method to avoid rewriting the trxn to the log file.
            count += await super.addTransaction(trxn) ? 1 : 0;
        }
        this.#initialized = true;
        return count;
    }

    async addTransaction(trxn: GinkTrxnBytes): Promise<boolean> {
        if (!this.#initialized) { await this.readLog(); }
        const added = await super.addTransaction(trxn);
        if (added) {
            const logFragment = new TransactionLog();
            logFragment.setTransactionsList([trxn]);
            const fileHandle = await this.#pFileHandle;
            await fileHandle.appendFile(logFragment.serializeBinary());
        }
        return added;
    }

    async getGreeting(): Promise<GreetingBytes> {
        if (!this.#initialized) { await this.readLog(); }
        return await super.getGreeting();
    }

    async getNeededTransactions(
        callBack: (x: GinkTrxnBytes) => void,
        greeting: Uint8Array | null = null,
        partialOkay: boolean = false): Promise<HasMap> {
        if (!this.#initialized) { await this.readLog(); }
        return await super.getNeededTransactions(callBack, greeting);
    }

    async close() {
        (await this.#pFileHandle).close();
        await super.close();
    }
}
