import { BundleBytes, Entry } from "../implementation/typedefs";
import { ChainTracker } from "../implementation/ChainTracker";
import { Store } from "../implementation/Store";
import { Behavior, EntryBuilder, ContainerBuilder, ChangeBuilder, BundleBuilder } from "../implementation/builders";
import {
    makeChainStart, extendChain, addTrxns,
    MEDALLION1, START_MICROS1, NEXT_TS1, MEDALLION2, START_MICROS2, NEXT_TS2
} from "./test_utils";
import { muidToBuilder, ensure, wrapValue, matches, wrapKey } from "../implementation/utils";
import { Bundler, Database } from "../implementation";
// makes an empty Store for testing purposes
export type StoreMaker = () => Promise<Store>;

// Jest complains if there's a test suite without a test.
it('placeholder', () => {
    expect(1 + 2).toBe(3);
});


/**
 *
 * @param storeMaker must return a fresh (empty) store on each invocation
 * @param implName name of this implementation
 * @param replacer thing to check when using persistence
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

    /*
    it(`${implName} test accepts chain start but only once`, async () => {
        const chainStart = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
        const [_info1, acceptedOnce] = await store.addBundle(chainStart);
        const [_info2, acceptedTwice] = await store.addBundle(chainStart);
        expect(acceptedOnce).toBeTruthy();
        expect(acceptedTwice).toBeFalsy();
    });
    */

    it(`${implName} ensure that it rejects when doesn't have chain start`, async () => {
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

    it(`${implName} test rejects missing link`, async () => {
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

    it(`${implName} test creates greeting`, async () => {
        await addTrxns(store);
        const hasMap = <ChainTracker>await store.getChainTracker();

        expect(hasMap.getCommitInfo([MEDALLION1, START_MICROS1])!.timestamp).toBe(NEXT_TS1);
        expect(hasMap.getCommitInfo([MEDALLION2, START_MICROS2])!.timestamp).toBe(NEXT_TS2);
    });

    it(`${implName} test sends trxns in order`, async () => {
        await addTrxns(store);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const sent: Array<BundleBytes> = [];
        await store.getCommits((x: BundleBytes) => { sent.push(x); });
        expect(sent.length).toBe(4);
        expect((<BundleBuilder>BundleBuilder.deserializeBinary(sent[0])).getTimestamp()).toBe(START_MICROS1);
        expect((<BundleBuilder>BundleBuilder.deserializeBinary(sent[1])).getTimestamp()).toBe(START_MICROS2);
        expect((<BundleBuilder>BundleBuilder.deserializeBinary(sent[2])).getTimestamp()).toBe(NEXT_TS1);
        expect((<BundleBuilder>BundleBuilder.deserializeBinary(sent[3])).getTimestamp()).toBe(NEXT_TS2);
    });

    it(`${implName} test claim chains`, async () => {
        const actorId = 17;
        await store.claimChain(MEDALLION1, START_MICROS1, actorId);
        await store.claimChain(MEDALLION2, START_MICROS2, actorId);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const active = await store.getClaimedChains();
        expect(active.size).toBe(2);
        expect(active.get(MEDALLION1).chainStart).toBe(START_MICROS1);
        expect(active.get(MEDALLION2).chainStart).toBe(START_MICROS2);
    });

    it(`${implName} test save/fetch container`, async () => {
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
        const commitInfo = await store.addBundle(BundleBytes);
        ensure(commitInfo.medallion == MEDALLION1);
        ensure(commitInfo.timestamp == START_MICROS1);
        const containerBytes = await store.getContainerBytes({ medallion: MEDALLION1, timestamp: START_MICROS1, offset: 7 });
        ensure(containerBytes);
        const containerBuilder2 = <ContainerBuilder>ContainerBuilder.deserializeBinary(containerBytes);
        ensure(containerBuilder2.getBehavior() == Behavior.DIRECTORY);
    });

    it(`${implName} create / view Entry`, async () => {
        const bundler = new Bundler();
        const sourceAddress = { medallion: 1, timestamp: 2, offset: 3 };
        const entryBuilder = new EntryBuilder();
        entryBuilder
            .setBehavior(Behavior.DIRECTORY)
            .setContainer(muidToBuilder(sourceAddress))
            .setKey(wrapKey("abc"))
            .setValue(wrapValue("xyz"));
        const address = bundler.addEntry(entryBuilder);
        bundler.seal({ medallion: 4, chainStart: 5, timestamp: 5 });
        await store.addBundle(bundler.bytes);
        ensure(address.medallion == 4);
        ensure(address.timestamp == 5);
        const entry = <Entry>await store.getEntryByKey(sourceAddress, "abc",);
        ensure(matches(entry.containerId, [2, 1, 3]));
        ensure(matches(entry.entryId, [5, 4, 1]));
        ensure(entry.value == "xyz");
        ensure(entry.effectiveKey == "abc");
    });

    it(`${implName} getChainIdentity works`, async () => {
        const db = new Database(store, 'test@identity');
        await db.ready;
        const chain = [...(await store.getClaimedChains()).entries()][0][1];
        const identity = await store.getChainIdentity([chain.medallion, chain.chainStart]);
        ensure(identity == 'test@identity');
    });
}
