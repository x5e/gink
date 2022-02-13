if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
}
import { Transaction } from "transactions_pb";
import { Greeting } from "messages_pb";
import { openDB, deleteDB, unwrap, IDBPDatabase, IDBPTransaction } from 'idb';
import { FileHandle } from "fs/promises";
var promises = require("fs").promises;

interface ChainInfo {
    medallion: number;
    chainStart: number;
    seenThrough: number;
    haveSince: number;
    lastComment?: string;
}

export class IndexedGink {
    pWrapped: Promise<IDBPDatabase>;
    pFileHandle: Promise<FileHandle|null>;
    constructor({
        indexedDbName = "gink",
        localTrxnLog = null, // only valid on server side
    }) {
        this.pWrapped = this.getWrapped(indexedDbName);
        this.pFileHandle = this.openFile(localTrxnLog);
    }
    async openFile(fn?: string): Promise<FileHandle|null> {
        if (!fn) return null;
        // TODO: probably should get an exclusive lock on the file

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
        let infoKey = (deserialized.getMedallion(), deserialized.getChainStart());
        let db: IDBPDatabase = await this.pWrapped;
        let wrappedTransaction = db.transaction(['trxns', 'chainInfos'], 'readwrite');
        let previous = deserialized.getPreviousTimestamp();
        let newTimestamp = deserialized.getTimestamp();
        let haveSince = 0;
        if (previous != 0) {
            let present: ChainInfo = await wrappedTransaction.objectStore("chainInfos").get(infoKey);
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
        await wrappedTransaction.objectStore("trxns").put(trxn, trxnKey);
        await wrappedTransaction.done;
        return newInfo;
    }
}