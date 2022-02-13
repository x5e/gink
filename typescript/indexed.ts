var promises = null;
export var mode = "browser";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
    promises = eval('require("fs").promises'); // ditto
    mode = "node";
}
import { Transaction } from "transactions_pb";
import { Greeting, Log as TransactionLog } from "messages_pb";
import { openDB, deleteDB, IDBPDatabase, IDBPTransaction } from 'idb';

interface ChainInfo {
    medallion: number;
    chainStart: number;
    seenThrough: number;
    haveSince: number;
    lastComment?: string;
}

interface FsHandle {
    appendFile(uint8Array: Uint8Array): Promise<any>;
    close(): void;
}

export class IndexedGink {
    pWrapped: Promise<IDBPDatabase>;
    fileHandle: FsHandle|null = null;
    constructor(
        indexedDbName = "gink",
    ) {
        this.pWrapped = this.getWrapped(indexedDbName);
    }
    async close() {
        const db = await this.pWrapped;
        db.close();
        if (this.fileHandle) {
            this.fileHandle.close();
        }
    }
    static async withTransactionLog(fn: string): Promise<IndexedGink> {
        /*
            The current implementation uses a fake in-memory implementation
            of IndexedDB.  So rather than rely on that for durability of 
            data, I'll just append each transaction to a log file and then
            read them all back into an empty IndexedDB on server startup.
            This is obviously not ideal; eventually want to move to a 
            durable indexedDB implementation (when I can find/write one).
        */
        // TODO: probably should get an exclusive lock on the file
        const fileHandle = await promises.open(fn, "a+");
        const stats = await fileHandle.stat();
        const size = stats.size;
        const uint8Array = new Uint8Array(size);
        await fileHandle.read(uint8Array, 0, size, 0);
        const trxns = TransactionLog.deserializeBinary(uint8Array).getTransactionsList();
        const indexedGink = new IndexedGink();
        // Note that indexedGink.fileHandle is null at this point so transactions aren't rewritten.
        for (const trxn of trxns) {
            await indexedGink.addTransaction(trxn);
        }
        console.log(`successfully read ${trxns.length} transactions`);
        indexedGink.fileHandle = fileHandle;
        return indexedGink;
    }
    async getGreeting(): Promise<Uint8Array> {
        const asEntries = (await this.getChainInfos()).map((value) => {
            let entry = new Greeting.GreetingEntry();
            entry.setMedallion(value.medallion);
            entry.setChainStart(value.chainStart);
            entry.setSeenThrough(value.seenThrough);
            return entry;
        })
        let greeting = new Greeting();
        greeting.setEntriesList(asEntries);
        return greeting.serializeBinary();
    }
    async getChainInfos(): Promise<Array<ChainInfo>> {
        let db: IDBPDatabase = await this.pWrapped;
        let wrappedTransaction: IDBPTransaction = db.transaction(['chainInfos']);
        let store = wrappedTransaction.objectStore('chainInfos');
        return await store.getAll();
    }
    getWrapped(name: string = "gink"): Promise<IDBPDatabase> {
        return openDB(name, 1, {
            upgrade(db: IDBPDatabase, oldVersion: number, newVersion: number, _transaction) {
                console.log(`upgrade, oldVersion:${oldVersion}, newVersion:${newVersion}`);
               /*
                    The object store for transactions will store the raw bytes received 
                    for each transaction to avoid dropping unknown fields.  Since this 
                    isn't a javascript object, we'll use a string representation of
                    (timestamp, medallion) to keep transactions ordered in time.
                */
                db.createObjectStore('trxns');
    
                /*
                    Stores ChainInfo objects.
                    This will keep track of which transcations have been seen per chain.
                */
                db.createObjectStore('chainInfos', { keyPath: ["medallion", "chainStart"] });
            },
            blocked() { },
            blocking() { },
            terminated() { },
        });
    }
    async addTransaction(trxn: Uint8Array) {
        let deserialized = Transaction.deserializeBinary(trxn);
        let infoKey = [deserialized.getMedallion(), deserialized.getChainStart()];
        let db: IDBPDatabase = await this.pWrapped;
        let wrappedTransaction = db.transaction(['trxns', 'chainInfos'], 'readwrite');
        let previous = deserialized.getPreviousTimestamp();
        let newTimestamp = deserialized.getTimestamp();
        let haveSince = 0;
        let present: ChainInfo = await wrappedTransaction.objectStore("chainInfos").get(infoKey);
        console.log("present: " + JSON.stringify(present));
        if (present || previous != 0) {
            if (present?.seenThrough >= newTimestamp) {
                console.log(`already have info for chain for ${present}`)
                return present;
            }
            if ( present?.seenThrough != previous) {
                throw new Error(`missing prior chain entry for ${deserialized.toObject()}, have ${present}`);
            }
            haveSince = present.haveSince;
        }
        let newInfo: ChainInfo = {
            medallion: deserialized.getMedallion(),
            chainStart: deserialized.getChainStart(),
            seenThrough: deserialized.getTimestamp(),
            haveSince: haveSince,
            lastComment: deserialized.getComment(),
        }
        await wrappedTransaction.objectStore("chainInfos").put(newInfo);
        const trxnKey = [deserialized.getTimestamp(), deserialized.getMedallion()];
        await wrappedTransaction.objectStore("trxns").add(trxn, trxnKey);
        await wrappedTransaction.done;
        if (this.fileHandle) {
            const logFragment = new TransactionLog();
            logFragment.setTransactionsList([trxn]);
            await this.fileHandle.appendFile(logFragment.serializeBinary());
        }
        return newInfo;
    }
}