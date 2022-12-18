import { ChangeSetBytes, ChangeSetInfo, Entry } from "../typescript-impl/typedefs"
import { ChainTracker } from "../typescript-impl/ChainTracker"
import { Store } from "../typescript-impl/Store";
import { ChangeSet as ChangeSetBuilder } from "gink/protoc.out/change_set_pb";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Behavior } from "gink/protoc.out/behavior_pb";
import {
    makeChainStart, extendChain, addTrxns,
    MEDALLION1, START_MICROS1, NEXT_TS1, MEDALLION2, START_MICROS2, NEXT_TS2
} from "./test_utils";
import { muidToBuilder, ensure, wrapValue, matches, wrapKey } from "../typescript-impl/utils";
import { ChangeSet } from "../typescript-impl";
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
        await store.ready;
    });

    afterEach(async () => {
        await store.close();
    });

    test(`${implName} test accepts chain start but only once`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const [_info1, acceptedOnce] = await store.addChangeSet(chainStart);
        const [_info2, acceptedTwice] = await store.addChangeSet(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });

    test(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        let added: boolean = false;
        let barfed = false;
        try {
            const result = await store.addChangeSet(secondTrxn);
            added = result[1];
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
        let added: boolean = false;
        let barfed = false;
        try {
            const result = await store.addChangeSet(thirdTrxn);
            added = result[1];
        } catch (e) {
            barfed = true;
        }
        expect(added).toBeFalsy();
        expect(barfed).toBeTruthy();
    });

    test(`${implName} test creates greeting`, async () => {
        await addTrxns(store);
        const hasMap = <ChainTracker> await store.getChainTracker();

        expect(hasMap.getCommitInfo([MEDALLION1, START_MICROS1])!.timestamp).toBe(NEXT_TS1);
        expect(hasMap.getCommitInfo([MEDALLION2, START_MICROS2])!.timestamp).toBe(NEXT_TS2);
    });

    test(`${implName} test sends trxns in order`, async () => {
        await addTrxns(store);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const sent: Array<ChangeSetBytes> = [];
        await store.getCommits((x: ChangeSetBytes) => { sent.push(x); });
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
        containerBuilder.setBehavior(Behavior.SCHEMA);
        changeBuilder.setContainer(containerBuilder);
        changeSetBuilder.getChangesMap().set(7, changeBuilder);
        const changeSetBytes = changeSetBuilder.serializeBinary();
        const [commitInfo, _novel] = await store.addChangeSet(changeSetBytes);
        ensure(commitInfo.medallion == MEDALLION1);
        ensure(commitInfo.timestamp == START_MICROS1);
        const containerBytes = await store.getContainerBytes({ medallion: MEDALLION1, timestamp: START_MICROS1, offset: 7 });
        ensure(containerBytes);
        const containerBuilder2 = ContainerBuilder.deserializeBinary(containerBytes);
        ensure(containerBuilder2.getBehavior() == Behavior.SCHEMA);
    });

    test(`${implName} create / view Entry`, async () => {
        const changeSet = new ChangeSet();
        const sourceAddress = {medallion: 1, timestamp:2, offset: 3};
        const address = changeSet.addEntry(
            (new EntryBuilder())
                .setBehavior(Behavior.SCHEMA)
                .setContainer(muidToBuilder(sourceAddress))
                .setKey(wrapKey("abc"))
                .setValue(wrapValue("xyz"))
        );
        changeSet.seal({medallion: 4, chainStart: 5, timestamp: 5});
        await store.addChangeSet(changeSet.bytes);
        ensure(address.medallion == 4);
        ensure(address.timestamp == 5);
        const entry = <Entry> await store.getEntry(sourceAddress, "abc",);
        ensure(matches(entry.containerId, [2,1,3]));
        ensure(matches(entry.entryId, [5,4,1]));
        ensure(entry.value == "xyz");
        ensure(entry.semanticKey[0] == "abc");
    });
}
