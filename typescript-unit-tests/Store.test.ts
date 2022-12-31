import { BundleBytes, Entry } from "../typescript-impl/typedefs"
import { ChainTracker } from "../typescript-impl/ChainTracker"
import { Store } from "../typescript-impl/Store";
import { Bundle as BundleBuilder } from "gink/protoc.out/bundle_pb";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Behavior } from "gink/protoc.out/behavior_pb";
import {
    makeChainStart, extendChain, addTrxns,
    MEDALLION1, START_MICROS1, NEXT_TS1, MEDALLION2, START_MICROS2, NEXT_TS2
} from "./test_utils";
import { muidToBuilder, ensure, wrapValue, matches, wrapKey } from "../typescript-impl/utils";
import { Bundler } from "../typescript-impl";
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
        const [_info1, acceptedOnce] = await store.addBundle(chainStart);
        const [_info2, acceptedTwice] = await store.addBundle(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });

    test(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const secondTrxn = extendChain("Hello, again!", chainStart, NEXT_TS1);
        let added: boolean = false;
        let barfed = false;
        try {
            const result = await store.addBundle(secondTrxn);
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
        await store.addBundle(chainStart);
        let added: boolean = false;
        let barfed = false;
        try {
            const result = await store.addBundle(thirdTrxn);
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
        const sent: Array<BundleBytes> = [];
        await store.getCommits((x: BundleBytes) => { sent.push(x); });
        expect(sent.length).toBe(4);
        expect(BundleBuilder.deserializeBinary(sent[0]).getTimestamp()).toBe(START_MICROS1);
        expect(BundleBuilder.deserializeBinary(sent[1]).getTimestamp()).toBe(START_MICROS2);
        expect(BundleBuilder.deserializeBinary(sent[2]).getTimestamp()).toBe(NEXT_TS1);
        expect(BundleBuilder.deserializeBinary(sent[3]).getTimestamp()).toBe(NEXT_TS2);
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
        const bundleBuilder = new BundleBuilder();
        bundleBuilder.setChainStart(START_MICROS1);
        bundleBuilder.setTimestamp(START_MICROS1);
        bundleBuilder.setMedallion(MEDALLION1);
        const changeBuilder = new ChangeBuilder();
        const containerBuilder = new ContainerBuilder();
        containerBuilder.setBehavior(Behavior.DIRECTORY);
        changeBuilder.setContainer(containerBuilder);
        bundleBuilder.getChangesMap().set(7, changeBuilder);
        const BundleBytes = bundleBuilder.serializeBinary();
        const [commitInfo, _novel] = await store.addBundle(BundleBytes);
        ensure(commitInfo.medallion == MEDALLION1);
        ensure(commitInfo.timestamp == START_MICROS1);
        const containerBytes = await store.getContainerBytes({ medallion: MEDALLION1, timestamp: START_MICROS1, offset: 7 });
        ensure(containerBytes);
        const containerBuilder2 = ContainerBuilder.deserializeBinary(containerBytes);
        ensure(containerBuilder2.getBehavior() == Behavior.DIRECTORY);
    });

    test(`${implName} create / view Entry`, async () => {
        const bundler = new Bundler();
        const sourceAddress = {medallion: 1, timestamp:2, offset: 3};
        const address = bundler.addEntry(
            (new EntryBuilder())
                .setBehavior(Behavior.DIRECTORY)
                .setContainer(muidToBuilder(sourceAddress))
                .setKey(wrapKey("abc"))
                .setValue(wrapValue("xyz"))
        );
        bundler.seal({medallion: 4, chainStart: 5, timestamp: 5});
        await store.addBundle(bundler.bytes);
        ensure(address.medallion == 4);
        ensure(address.timestamp == 5);
        const entry = <Entry> await store.getEntry(sourceAddress, "abc",);
        ensure(matches(entry.containerId, [2,1,3]));
        ensure(matches(entry.entryId, [5,4,1]));
        ensure(entry.value == "xyz");
        ensure(entry.semanticKey[0] == "abc");
    });
}
