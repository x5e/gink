import { CommitBytes } from "./typedefs"
import { Store } from "./Store";
import { Commit } from "commit_pb";
import { extractCommitInfo } from "./utils";
import { makeChainStart, extendChain, addTrxns, 
    MEDALLION1, START_MICROS1, NEXT_TS1, MEDALLION2, START_MICROS2, NEXT_TS2 } from "./test_utils";
// makes an empty Store for testing purposes
export type StoreMaker = () => Promise<Store>;

// Jest complains if there's a test suite without a test.
test('placeholder', () => {
    expect(1 + 2).toBe(3);
});


/**
 * 
 * @param storeMaker must return a fresh (empty) store on each invocation
 * @param implName name of this implementation
 */
export function testStore(implName: string, storeMaker: StoreMaker, replacer?: StoreMaker) {
    let store: Store;

    beforeEach(async () => {
        store = await storeMaker();
        await store.initialized;
    });

    afterEach(async () => {
        await store.close();
    });

    test(`${implName} test accepts chain start but only once`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const commitInfo = extractCommitInfo(chainStart)
        const acceptedOnce = await store.addCommit(chainStart, commitInfo);
        const acceptedTwice = await store.addCommit(chainStart, commitInfo);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });

    test(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        let added = null;
        let barfed = false;
        try {
            added = await store.addCommit(secondTrxn, extractCommitInfo(secondTrxn));
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
        await store.addCommit(chainStart, extractCommitInfo(chainStart));
        let added = null;
        let barfed = false;
        try {
            added = await store.addCommit(thirdTrxn, extractCommitInfo(thirdTrxn));
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test creates greeting`, async () => {
        await addTrxns(store);
        const hasMap = await store.getChainTracker();

        expect(hasMap.getSeenTo([MEDALLION1, START_MICROS1])).toBe(NEXT_TS1);
        expect(hasMap.getSeenTo([MEDALLION2, START_MICROS2])).toBe(NEXT_TS2);
    });

    test(`${implName} test sends trxns in order`, async () => {
        await addTrxns(store);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const sent: Array<CommitBytes> = [];
        await store.getCommits((x: CommitBytes) => {sent.push(x);});
        expect(sent.length).toBe(4);
        expect(Commit.deserializeBinary(sent[0]).getTimestamp()).toBe(START_MICROS1);
        expect(Commit.deserializeBinary(sent[1]).getTimestamp()).toBe(START_MICROS2);
        expect(Commit.deserializeBinary(sent[2]).getTimestamp()).toBe(NEXT_TS1);
        expect(Commit.deserializeBinary(sent[3]).getTimestamp()).toBe(NEXT_TS2);
    });

    test(`${implName} test claim chains`, async () => {
        await store.claimChain(MEDALLION1, START_MICROS1);
        await store.claimChain(MEDALLION2, START_MICROS2);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const active = await store.getClaimedChains();
        expect(active.size).toBe(2);
        expect(active.get(MEDALLION1)).toBe(START_MICROS1);
        expect(active.get(MEDALLION2)).toBe(START_MICROS2);
    });
}
