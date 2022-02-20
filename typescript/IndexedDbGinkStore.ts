
export var mode = "browser";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
    mode = "node";
}
import { Transaction } from "transactions_pb";
import { Greeting } from "messages_pb";
import { openDB, deleteDB, IDBPDatabase, IDBPTransaction } from 'idb';
import { GinkStore } from "./GinkStore";
import { GreetingBytes, GinkTrxnBytes, Timestamp, Medallion, ChainStart, HasMap } from "./typedefs";
import { makeHasMap } from "./makeHasMap";

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


export class IndexedDbGinkStore implements GinkStore {

    #pWrapped: Promise<IDBPDatabase>;

    constructor(indexedDbName = "gink", reset = false) {
        if (reset) {
            this.#pWrapped = this.#delete(indexedDbName).then(() => this.#open(indexedDbName));
        } else {
            this.#pWrapped = this.#open(indexedDbName);
        }
    }

    async #delete(indexedDbName: string) {
        return deleteDB(indexedDbName, {
            blocked() {
                console.error(`unable to delete database ${indexedDbName} due to another database having it opened.`);
            }
        });
    }

    async #open(indexedDbName: string) {
        return openDB(indexedDbName, 1, {
            upgrade(db: IDBPDatabase, _oldVersion: number, _newVersion: number, _transaction) {
                // console.log(`upgrade, oldVersion:${oldVersion}, newVersion:${newVersion}`);
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

    async addTransaction(trxn: GinkTrxnBytes, hasMap?: HasMap): Promise<boolean> {
        let parsed = Transaction.deserializeBinary(trxn);
        const medallion = parsed.getMedallion();
        const chainStart = parsed.getChainStart();
        const infoKey = [medallion, chainStart];
        const db: IDBPDatabase = await this.#pWrapped;
        const wrappedTransaction = db.transaction(['trxns', 'chainInfos'], 'readwrite');
        const trxnPreviousTimestamp = parsed.getPreviousTimestamp();
        const trxnTimestamp = parsed.getTimestamp();
        let oldChainInfo: ChainInfo = await wrappedTransaction.objectStore("chainInfos").get(infoKey);
        if (oldChainInfo || trxnPreviousTimestamp != 0) {
            if (oldChainInfo?.seenThrough >= trxnTimestamp) {
                return false;
            }
            if (oldChainInfo?.seenThrough != trxnPreviousTimestamp) {
                throw new Error(`missing prior chain entry for ${parsed.toObject()}, have ${oldChainInfo}`);
            }
        }
        let newInfo: ChainInfo = {
            medallion: medallion,
            chainStart: chainStart,
            seenThrough: trxnTimestamp,
            lastComment: parsed.getComment(),
        }
        await wrappedTransaction.objectStore("chainInfos").put(newInfo);
        // Only timestamp and medallion are required for uniqueness, the others just added to make
        // the getNeededTransactions faster by not requiring re-parsing.
        const trxnKey: TransactionKey = [trxnTimestamp, medallion, chainStart, trxnPreviousTimestamp];
        await wrappedTransaction.objectStore("trxns").add(trxn, trxnKey);
        await wrappedTransaction.done;
        if (hasMap) {
            if (!hasMap.has(medallion)) { hasMap.set(medallion, new Map()); }
            hasMap.get(medallion).set(chainStart, trxnTimestamp);
        }
        return true;
    }

    // Note the IndexedDB has problems when await is called on anything unrelated
    // to the current transaction, so its best if `callBack` doesn't call await.
    async getNeededTransactions(
        callBack: (x: GinkTrxnBytes) => void,
        greeting?: GreetingBytes): Promise<HasMap> {

        const hasMap: HasMap = makeHasMap(greeting);

        // We loop through all transactions and send those the peer doesn't have.
        const db = await this.#pWrapped;
        for (let cursor = await db.transaction("trxns").objectStore("trxns").openCursor();
            cursor; cursor = await cursor.continue()) {
            const key = <TransactionKey>cursor.key;
            const ginkTrxn: GinkTrxnBytes = cursor.value;
            const [trxnTime, medallion, chainStart, priorTime] = key;
            if (!hasMap.has(medallion)) { hasMap.set(medallion, new Map()); }
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