import { CommitBytes } from "./typedefs"
import { Store } from "./Store";
import { ChangeSet as ChangeSetBuilder } from "change_set_pb";
import { Change as ChangeBuilder } from "change_pb";
import { Container as ContainerBuilder } from "container_pb";
import { Entry as EntryBuilder } from "entry_pb";
import {
    makeChainStart, extendChain, addTrxns,
    MEDALLION1, START_MICROS1, NEXT_TS1, MEDALLION2, START_MICROS2, NEXT_TS2
} from "./test_utils";
import { addressToMuid, assert, wrapValue, muidToAddress, unwrapValue } from "./utils";
import { ChangeSet } from "./ChangeSet";
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
        const acceptedOnce = await store.addChangeSet(chainStart);
        const acceptedTwice = await store.addChangeSet(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });

    test(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        let added = null;
        let barfed = false;
        try {
            added = await store.addChangeSet(secondTrxn);
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test rejects missing link`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        const thirdTrxn = extendChain("Hello, a third!", secondTrxn, NEXT_TS1 + 1);
        await store.addChangeSet(chainStart);
        let added = null;
        let barfed = false;
        try {
            added = await store.addChangeSet(thirdTrxn);
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test creates greeting`, async () => {
        await addTrxns(store);
        const hasMap = await store.getChainTracker();

        expect(hasMap.getCommitInfo([MEDALLION1, START_MICROS1]).timestamp).toBe(NEXT_TS1);
        expect(hasMap.getCommitInfo([MEDALLION2, START_MICROS2]).timestamp).toBe(NEXT_TS2);
    });

    test(`${implName} test sends trxns in order`, async () => {
        await addTrxns(store);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const sent: Array<CommitBytes> = [];
        await store.getCommits((x: CommitBytes) => { sent.push(x); });
        expect(sent.length).toBe(4);
        expect(ChangeSetBuilder.deserializeBinary(sent[0]).getTimestamp()).toBe(START_MICROS1);
        expect(ChangeSetBuilder.deserializeBinary(sent[1]).getTimestamp()).toBe(START_MICROS2);
        expect(ChangeSetBuilder.deserializeBinary(sent[2]).getTimestamp()).toBe(NEXT_TS1);
        expect(ChangeSetBuilder.deserializeBinary(sent[3]).getTimestamp()).toBe(NEXT_TS2);
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

    test(`${implName} test save/fetch container`, async () => {
        const changeSetBuilder = new ChangeSetBuilder();
        changeSetBuilder.setChainStart(START_MICROS1);
        changeSetBuilder.setTimestamp(START_MICROS1);
        changeSetBuilder.setMedallion(MEDALLION1);
        const changeBuilder = new ChangeBuilder();
        const containerBuilder = new ContainerBuilder();
        containerBuilder.setBehavior(ContainerBuilder.Behavior.SCHEMA);
        changeBuilder.setContainer(containerBuilder);
        changeSetBuilder.getChangesMap().set(7, changeBuilder);
        const changeSetBytes = changeSetBuilder.serializeBinary();
        const commitInfo = await store.addChangeSet(changeSetBytes);
        assert(commitInfo.medallion == MEDALLION1);
        assert(commitInfo.timestamp == START_MICROS1);
        const containerBytes = await store.getContainerBytes({ medallion: MEDALLION1, timestamp: START_MICROS1, offset: 7 });
        assert(containerBytes);
        const containerBuilder2 = ContainerBuilder.deserializeBinary(containerBytes);
        assert(containerBuilder2.getBehavior() == ContainerBuilder.Behavior.SCHEMA);
    });

    test(`${implName} create / view Entry`, async () => {
        const changeSet = new ChangeSet();
        const sourceAddress = {medallion: 1, timestamp:2, offset: 3};
        const address = changeSet.addEntry(
            (new EntryBuilder())
                .setSource(addressToMuid(sourceAddress))
                .setKey(wrapValue("abc"))
                .setValue(wrapValue("xyz"))
        );
        await store.addChangeSet(changeSet.seal({medallion: 4, chainStart: 5, timestamp: 5}));
        assert(address.medallion == 4);
        assert(address.timestamp == 5);
        const entryBytes = await store.getEntryBytes(sourceAddress, "abc");
        const entryBuilder = EntryBuilder.deserializeBinary(entryBytes);
        assert(entryBuilder.getSource().getMedallion() == 1);
        assert(entryBuilder.getSource().getTimestamp() == 2);
        assert(entryBuilder.getSource().getOffset() == 3);
        assert(unwrapValue(entryBuilder.getKey()) == "abc");
        assert(unwrapValue(entryBuilder.getValue()) == "xyz");
    });
}
