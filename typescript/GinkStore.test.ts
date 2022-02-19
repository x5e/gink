import { GinkStore, GinkTrxnBytes, Medallion, ChainStart } from "./GinkStore";
import { Transaction } from "transactions_pb";

// makes an empty GinkStore for testing purposes
export type GinkStoreMaker = () => Promise<GinkStore>;

// Jest complains if there's a test suite without a test.
test('placeholder', () => {
    expect(1 + 2).toBe(3);
});


const MEDALLION1 = 425579549941797;
const START_MILLIS1 = 1643351021040;
const START_MICROS1 = START_MILLIS1 * 1000;

function makeChainStart(comment: string, medallion: Medallion, chainStart: ChainStart): GinkTrxnBytes {
    const transaction = new Transaction();
    transaction.setChainStart(chainStart);
    transaction.setTimestamp(chainStart);
    transaction.setMedallion(medallion);
    transaction.setComment(comment);
    return transaction.serializeBinary();
}

function extendChain(comment: string, previous: GinkTrxnBytes): GinkTrxnBytes {
    const parsedPrevious = Transaction.deserializeBinary(previous);
    const subsequent = new Transaction();
    subsequent.setMedallion(parsedPrevious.getMedallion());
    subsequent.setPreviousTimestamp(parsedPrevious.getTimestamp());
    subsequent.setChainStart(parsedPrevious.getChainStart());
    subsequent.setTimestamp(parsedPrevious.getTimestamp() + 1000); // one millisecond later
    subsequent.setComment(comment);
    return subsequent.serializeBinary();
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

    test(`${implName} testAcceptsChainStartOnce`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const acceptedOnce = await ginkStore.addTransaction(chainStart);
        const acceptedTwice = await ginkStore.addTransaction(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
        await ginkStore.close();
    });

    test(`${implName} testRejectsTransactionWithoutStart`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart);
        let added = false;
        let barfed = false;
        try {
            added = await ginkStore.addTransaction(secondTrxn);
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });
}