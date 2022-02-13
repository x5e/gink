var promises = null;
export var mode = "browser";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
    promises = eval('require("fs").promises'); // ditto
    mode = "node";
}
import { Transaction } from "transactions_pb";
import { Greeting, Log as TransactionLog } from "messages_pb";
import { openDB, IDBPDatabase, IDBPTransaction } from 'idb';

type Medallion = number;
type Timestamp = number;
type ChainStart = Timestamp;
type PriorTime = Timestamp;
type SeenThrough = Timestamp;
type HasMap = Map<Medallion,Map<ChainStart,SeenThrough>>;
type GinkTrxnBytes = Uint8Array;
type GreetingBytes = Uint8Array;

interface ChainInfo {
    medallion: Medallion;
    chainStart: ChainStart;
    seenThrough: Timestamp;
    lastComment?: string;
}

// [Timestamp, Medallion] should enough to uniquely specify a Transaction.
// ChainStart and PriorTime are just included here to avoid re-parsing.
type TransactionKey = [Timestamp, Medallion, ChainStart, PriorTime];

interface FsHandle {
    appendFile(uint8Array: Uint8Array): Promise<any>;
    close(): void;
}

export class IndexedGink {

    #pWrapped: Promise<IDBPDatabase>;
    fileHandle: FsHandle|null = null;

    constructor(
        indexedDbName = "gink",
    ) {
        this.#pWrapped = openDB(indexedDbName, 1, {
            upgrade(db: IDBPDatabase, oldVersion: number, newVersion: number, _transaction) {
                console.log(`upgrade, oldVersion:${oldVersion}, newVersion:${newVersion}`);
               /*
                    The object store for transactions will store the raw bytes received 
                    for each transaction to avoid dropping unknown fields.  Since this 
                    isn't a javascript object, we'll use 
                    [timestamp, medallion] to keep transactions ordered in time.
                */
                db.createObjectStore('trxns');
    
                /*
                    Stores ChainInfo objects.
                    This will keep track of which transactions have been processed per chain.
                */
                db.createObjectStore('chainInfos', { keyPath: ["medallion", "chainStart"] });
            },
        });
    }

    async close() {
        const db = await this.#pWrapped;
        db.close();
        if (this.fileHandle) {
            this.fileHandle.close();
        }
    }

    static async withTransactionLog(filename: string): Promise<IndexedGink> {
        /*
            The current implementation uses a fake in-memory implementation
            of IndexedDB.  So rather than rely on that for durability of 
            data, I'll just append each transaction to a log file and then
            read them all back into an empty IndexedDB on server startup.
            This is obviously not ideal; eventually want to move to a 
            durable indexedDB implementation (when I can find/write one).
        */
        // TODO: probably should get an exclusive lock on the file
        const fileHandle = await promises.open(filename, "a+");
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
    
    async getGreeting(): Promise<GreetingBytes> {
        const asEntries = (await this.#getChainInfos()).map((value) => {
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

    async #getChainInfos(): Promise<Array<ChainInfo>> {
        let db: IDBPDatabase = await this.#pWrapped;
        let wrappedTransaction: IDBPTransaction = db.transaction(['chainInfos']);
        let store = wrappedTransaction.objectStore('chainInfos');
        return await store.getAll();
    }

    async addTransaction(trxn: GinkTrxnBytes) {
        let parsed = Transaction.deserializeBinary(trxn);
        let infoKey = [parsed.getMedallion(), parsed.getChainStart()];
        let db: IDBPDatabase = await this.#pWrapped;
        let wrappedTransaction = db.transaction(['trxns', 'chainInfos'], 'readwrite');
        let previous = parsed.getPreviousTimestamp();
        let newTimestamp = parsed.getTimestamp();
        let present: ChainInfo = await wrappedTransaction.objectStore("chainInfos").get(infoKey);
        if (present || previous != 0) {
            if (present?.seenThrough >= newTimestamp) {
                return present;
            }
            if ( present?.seenThrough != previous) {
                throw new Error(`missing prior chain entry for ${parsed.toObject()}, have ${present}`);
            }
        }
        let newInfo: ChainInfo = {
            medallion: parsed.getMedallion(),
            chainStart: parsed.getChainStart(),
            seenThrough: parsed.getTimestamp(),
            lastComment: parsed.getComment(),
        }
        await wrappedTransaction.objectStore("chainInfos").put(newInfo);
        const trxnKey: TransactionKey = [parsed.getTimestamp(), parsed.getMedallion(), 
            parsed.getChainStart(), parsed.getPreviousTimestamp()];
        await wrappedTransaction.objectStore("trxns").add(trxn, trxnKey);
        await wrappedTransaction.done;
        if (this.fileHandle) {
            const logFragment = new TransactionLog();
            logFragment.setTransactionsList([trxn]);
            await this.fileHandle.appendFile(logFragment.serializeBinary());
        }
        return newInfo;
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current transaction, so its best if `callBack` doesn't call await.
    async getNeededTransactions(
            callBack: (x: GinkTrxnBytes) => void, 
            greeting: Uint8Array|null = null, 
            partialOkay: boolean = false): Promise<HasMap> {
        const parsed = greeting ? Greeting.deserializeBinary(greeting) : new Greeting();
        const hasMap: HasMap = new Map();
        let entry: Greeting.GreetingEntry|null;
        for (entry in parsed.getEntriesList()) {
            if (!hasMap.has(entry.getMedallion())) {
                hasMap.set(entry.getMedallion(), new Map());
            }
            hasMap.get(entry.getMedallion()).set(entry.getChainStart(), entry.getSeenThrough());
        }
        const db = await this.#pWrapped;
        
        for (let cursor = await db.transaction("trxns").objectStore("trxns").openCursor(); 
            cursor; cursor = await cursor.continue()) {
            const key = <TransactionKey> cursor.key;
            const ginkTrxn: GinkTrxnBytes = cursor.value;
            const [trxnTime, medallion, chainStart, priorTime] = key;
            if (!hasMap.has(medallion)) {hasMap.set(medallion, new Map());}
            let seenThrough = hasMap.get(medallion).get(chainStart);
            if (!seenThrough) {
                if (priorTime == 0 || partialOkay) {
                    // happy path: sending the start of a chain
                    callBack(ginkTrxn);
                    hasMap.get(medallion).set(chainStart, trxnTime);
                    continue;
                } 
                throw new Error(`Peer doesn't have the start of ${medallion},${chainStart}` +
                    "and neither do I and partialOkay=False"); 
            } 
            if (seenThrough >= trxnTime) {
                continue;  // happy path: peer doesn't need this transaction
            }
            if (seenThrough == priorTime) {
                // another happy path: peer has everything in this chain up to this transaction
                callBack(ginkTrxn);
                hasMap.get(medallion).set(chainStart, trxnTime);
                continue;
            }
            if (partialOkay) {
                // not really a happy path but we're just going to skip syncing this chain
                continue;
            }
            throw new Error(`unable to continue chain ${medallion},${chainStart} ` +
                `peer has seenThrough=${seenThrough}, I have priorTime=${priorTime}`);
          }
        return hasMap;
    }
}