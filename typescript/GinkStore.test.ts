import { Medallion, ChainStart, GinkTrxnBytes, HasMap, Timestamp } from "./typedefs"
import { GinkStore } from "./GinkStore";
import { Transaction } from "transactions_pb";
import { makeHasMap } from "./utils";

// makes an empty GinkStore for testing purposes
export type GinkStoreMaker = () => Promise<GinkStore>;

// Jest complains if there's a test suite without a test.
test('placeholder', () => {
    expect(1 + 2).toBe(3);
});

const MEDALLION1 = 425579549941797;
const START_MICROS1 = Date.parse("2022-02-19 23:24:50") * 1000;
const NEXT_TS1 = Date.parse("2022-02-20 00:39:29") * 1000;

const MEDALLION2 = 458510670893748;
const START_MICROS2 = Date.parse("2022-02-20 00:38:21") * 1000;
const NEXT_TS2 = Date.parse("2022-02-20 00:40:12") * 1000;


function makeChainStart(comment: string, medallion: Medallion, chainStart: ChainStart): GinkTrxnBytes {
    const transaction = new Transaction();
    transaction.setChainStart(chainStart);
    transaction.setTimestamp(chainStart);
    transaction.setMedallion(medallion);
    transaction.setComment(comment);
    return transaction.serializeBinary();
}

function extendChain(comment: string, previous: GinkTrxnBytes, timestamp: Timestamp): GinkTrxnBytes {
    const parsedPrevious = Transaction.deserializeBinary(previous);
    const subsequent = new Transaction();
    subsequent.setMedallion(parsedPrevious.getMedallion());
    subsequent.setPreviousTimestamp(parsedPrevious.getTimestamp());
    subsequent.setChainStart(parsedPrevious.getChainStart());
    subsequent.setTimestamp(timestamp); // one millisecond later
    subsequent.setComment(comment);
    return subsequent.serializeBinary();
}

async function addTrxns(ginkStore: GinkStore, hasMap?: HasMap) {
    const start1 = makeChainStart("chain1,tx1", MEDALLION1, START_MICROS1);
    await ginkStore.addTransaction(start1, hasMap);
    const next1 = extendChain("chain1,tx2", start1, NEXT_TS1);
    await ginkStore.addTransaction(next1, hasMap);
    const start2 = makeChainStart("chain2,tx1", MEDALLION2, START_MICROS2);
    await ginkStore.addTransaction(start2, hasMap);
    const next2 = extendChain("chain2,2", start2, NEXT_TS2);
    await ginkStore.addTransaction(next2, hasMap);
}

/**
 * 
 * @param ginkStoreMaker must return a fresh (empty) store on each invocation
 * @param implName name of this implementation
 */
export function testGinkStore(implName: string, ginkStoreMaker: GinkStoreMaker) {
    let ginkStore: GinkStore;

    beforeEach(async () => {
        ginkStore = await ginkStoreMaker();
    });

    afterEach(async () => {
        await ginkStore.close();
    });

    test(`${implName} test accepts chain start but only once`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const acceptedOnce = await ginkStore.addTransaction(chainStart);
        const acceptedTwice = await ginkStore.addTransaction(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });

    test(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        let added = null;
        let barfed = false;
        try {
            added = await ginkStore.addTransaction(secondTrxn);
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test rejects missing link`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        const thirdTrxn = extendChain("Hello, a third!", secondTrxn, NEXT_TS1+1);
        await ginkStore.addTransaction(chainStart);
        let added = null;
        let barfed = false;
        try {
            added = await ginkStore.addTransaction(thirdTrxn);
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test creates greeting`, async () => {
        await addTrxns(ginkStore);
        const hasMap = await ginkStore.getHasMap();
        expect(hasMap.size).toBe(2);
        expect(hasMap.has(MEDALLION1));
        expect(hasMap.has(MEDALLION2));
        expect(hasMap.get(MEDALLION1).get(START_MICROS1)).toBe(NEXT_TS1);
        expect(hasMap.get(MEDALLION2).get(START_MICROS2)).toBe(NEXT_TS2);
    });

    test(`${implName} test sends trxns in order`, async () => {
        await addTrxns(ginkStore);
        const sent: Array<GinkTrxnBytes> = [];
        await ginkStore.getNeededTransactions((x: GinkTrxnBytes) => {sent.push(x);});
        expect(sent.length).toBe(4);
        expect(Transaction.deserializeBinary(sent[0]).getTimestamp()).toBe(START_MICROS1);
        expect(Transaction.deserializeBinary(sent[1]).getTimestamp()).toBe(START_MICROS2);
        expect(Transaction.deserializeBinary(sent[2]).getTimestamp()).toBe(NEXT_TS1);
        expect(Transaction.deserializeBinary(sent[3]).getTimestamp()).toBe(NEXT_TS2);
    });
}