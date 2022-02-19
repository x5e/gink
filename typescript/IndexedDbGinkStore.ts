
export var mode = "browser";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
    mode = "node";
}
import { Transaction } from "transactions_pb";
import { Greeting } from "messages_pb";
import { openDB, IDBPDatabase, IDBPTransaction } from 'idb';
import { GinkStore, GreetingBytes, GinkTrxnBytes, Timestamp, Medallion, ChainStart, HasMap } from "./GinkStore";

export interface ChainInfo {
    medallion: Medallion;
    chainStart: ChainStart;
    seenThrough: Timestamp;
    lastComment?: string;
}


type PriorTime = Timestamp;


// [Timestamp, Medallion] should enough to uniquely specify a Transaction.
// ChainStart and PriorTime are just included here to avoid re-parsing.
type TransactionKey = [Timestamp, Medallion, ChainStart, PriorTime];


export class IndexedDbGinkStore implements GinkStore{

    #pWrapped: Promise<IDBPDatabase>;

    constructor(indexedDbName = "gink",) {
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
        (await this.#pWrapped).close();
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

    async addTransaction(trxn: GinkTrxnBytes): Promise<boolean> {
        let parsed = Transaction.deserializeBinary(trxn);
        let infoKey = [parsed.getMedallion(), parsed.getChainStart()];
        let db: IDBPDatabase = await this.#pWrapped;
        let wrappedTransaction = db.transaction(['trxns', 'chainInfos'], 'readwrite');
        let previous = parsed.getPreviousTimestamp();
        let newTimestamp = parsed.getTimestamp();
        let present: ChainInfo = await wrappedTransaction.objectStore("chainInfos").get(infoKey);
        if (present || previous != 0) {
            if (present?.seenThrough >= newTimestamp) {
                return false;
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
        return true;
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current transaction, so its best if `callBack` doesn't call await.
    async getNeededTransactions(
            callBack: (x: GinkTrxnBytes) => void, 
            greeting: Uint8Array|null = null): Promise<HasMap> {
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
                if (priorTime == 0) {
                    // happy path: sending the start of a chain
                    callBack(ginkTrxn);
                    hasMap.get(medallion).set(chainStart, trxnTime);
                    continue;
                } 
                throw new Error(`Peer doesn't have the start of ${medallion},${chainStart}` +
                    "and neither do I."); 
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
            throw new Error(`unable to continue chain ${medallion},${chainStart} ` +
                `peer has seenThrough=${seenThrough}, I have priorTime=${priorTime}`);
          }
        return hasMap;
    }
}