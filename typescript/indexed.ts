if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
}
import { Transaction } from "transactions_pb";
import { openDB, deleteDB, wrap, unwrap, IDBPDatabase, IDBPTransaction } from 'idb';

interface ChainInfo {
    medallion: number;
    chainStart: number;
    seenThrough: number;
    haveSince: number;
    lastComment?: string;
}

function getDb(name: string = "gink"): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        var openRequest: IDBOpenDBRequest = indexedDB.open(name, 1);
        openRequest.onerror = reject;
        openRequest.onupgradeneeded = function (_event) {
            let db = openRequest.result;
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
        }
        openRequest.onsuccess = function () {
            resolve(openRequest.result);
        };
    })
}

export function getWrapped(name: string = "gink"): Promise<IDBPDatabase> {
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

export class IndexedGink {
    pIDBDatabase: Promise<IDBDatabase>;
    pWrapped: Promise<IDBPDatabase>;
    constructor(name: string = "gink") {
        this.pWrapped = getWrapped(name);
        this.pIDBDatabase = this.pWrapped.then(x => unwrap(x));
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