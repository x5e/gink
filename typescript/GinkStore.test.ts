import {GinkStore, GinkTrxnBytes, Medallion, ChainStart} from "./GinkStore";
import { Transaction } from "transactions_pb";

const MEDALLION1 = 425579549941797;
const START_MILLIS1 = 1643351021040;
var START_MICROS1 = START_MILLIS1 * 1000;

function makeChainStart(comment: string, medallion: Medallion, chainStart: ChainStart): GinkTrxnBytes {
    const transaction = new Transaction();
    transaction.setChainStart(chainStart);
    transaction.setMedallion(medallion);
    transaction.setComment(comment);
    transaction.setPreviousTimestamp(0); // would be implicit
    return transaction.serializeBinary();
}

export async function testAcceptsChainStartOnce(ginkStore: GinkStore) {
    const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
    const acceptedOnce = await ginkStore.addTransaction(chainStart);
    const acceptedTwice = await ginkStore.addTransaction(chainStart);
    expect(acceptedOnce).toBeTruthy();
    expect(acceptedTwice).toBeFalsy();
}

test('placeholder', () => {
    expect(1+2).toBe(3);
});
