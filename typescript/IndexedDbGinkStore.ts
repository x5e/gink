
export var mode = "browser";
if (eval("typeof indexedDB") == 'undefined') {  // ts-node has problems with typeof
    eval('require("fake-indexeddb/auto");');  // hide require from webpack
    mode = "node";
}
import { Transaction } from "transactions_pb";
import { Greeting } from "messages_pb";
import { openDB, deleteDB, IDBPDatabase, IDBPTransaction } from 'idb';
import { GinkStore } from "./GinkStore";
import { GreetingBytes, GinkTrxnBytes, Timestamp, Medallion, ChainStart, HasMap, CommitInfo } from "./typedefs";
import { chdir } from "process";

export interface ChainInfo {
    medallion: Medallion;
    chainStart: ChainStart;
    seenThrough: Timestamp;
    lastComment?: string;
}

export class IndexedDbGinkStore implements GinkStore {

    initialized: Promise<void>;
    #wrapped: IDBPDatabase;

    constructor(indexedDbName = "gink", reset = false) {
        this.initialized = this.#initialize(indexedDbName, reset);
    }

    async #initialize(indexedDbName: string, reset: boolean): Promise<void> {
        if (reset) {
            await deleteDB(indexedDbName, {
                blocked() {
                    const msg = `Unable to delete IndexedDB database ${indexedDbName} !!!`;
                    console.error(msg);
                    throw new Error(msg);
                }
            });
        }
        this.#wrapped = await openDB(indexedDbName, 1, {
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
        await this.initialized;
        this.#wrapped.close();
    }

    async getGreeting(): Promise<GreetingBytes> {
        await this.initialized;
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

    async getHasMap(): Promise<HasMap> {
        await this.initialized;
        const hasMap: HasMap = new Map();
        (await this.#getChainInfos()).map((value) => {
            let medallionMap = hasMap.get(value.medallion);
            if (!medallionMap) {
                medallionMap = new Map();
                hasMap.set(value.medallion, medallionMap);
            }
            medallionMap.set(value.chainStart, value.seenThrough);
        })
        return hasMap;
    }

    async #getChainInfos(): Promise<Array<ChainInfo>> {
        await this.initialized;
        let wrappedTransaction: IDBPTransaction = this.#wrapped.transaction(['chainInfos']);
        let store = wrappedTransaction.objectStore('chainInfos');
        return await store.getAll();
    }

    async addTransaction(trxn: GinkTrxnBytes, hasMap?: HasMap): Promise<boolean> {
        await this.initialized;
        let parsed = Transaction.deserializeBinary(trxn);
        const medallion = parsed.getMedallion();
        const chainStart = parsed.getChainStart();
        const infoKey = [medallion, chainStart];
        const wrappedTransaction = this.#wrapped.transaction(['trxns', 'chainInfos'], 'readwrite');
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
        const trxnKey: CommitInfo = [trxnTimestamp, medallion, chainStart, trxnPreviousTimestamp];
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
        callBack: (commitBytes: GinkTrxnBytes, commitInfo: CommitInfo) => void,
        hasMap?: HasMap) {

        await this.initialized;
        hasMap = hasMap ?? new Map();

        // We loop through all transactions and send those the peer doesn't have.
        for (let cursor = await this.#wrapped.transaction("trxns").objectStore("trxns").openCursor();
            cursor; cursor = await cursor.continue()) {
            const commitInfo = <CommitInfo>cursor.key;
            const ginkTrxn: GinkTrxnBytes = cursor.value;
            const [trxnTime, medallion, chainStart, priorTime] = commitInfo;
            if (!hasMap.has(medallion)) { hasMap.set(medallion, new Map()); }
            let seenThrough = hasMap.get(medallion).get(chainStart);
            if (!seenThrough) {
                if (priorTime == 0) {
                    // happy path: sending the start of a chain
                    callBack(ginkTrxn, commitInfo);
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
                callBack(ginkTrxn, commitInfo);
                hasMap.get(medallion).set(chainStart, trxnTime);
                continue;
            }
            throw new Error(`unable to continue chain ${medallion},${chainStart} ` +
                `peer has seenThrough=${seenThrough}, I have priorTime=${priorTime}`);
        }
        return hasMap;
    }
}