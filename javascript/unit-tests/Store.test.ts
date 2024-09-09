import { isEqual } from "lodash";
import { BundleBytes, Entry, BundleView } from "../implementation/typedefs";
import { ChainTracker } from "../implementation/ChainTracker";
import { Store } from "../implementation/Store";
import { Decomposition } from "../implementation/Decomposition";
import {
    Behavior,
    EntryBuilder,
    ContainerBuilder,
    ChangeBuilder,
    BundleBuilder,
} from "../implementation/builders";
import {
    makeChainStart,
    extendChain,
    addTrxns,
    unbundle,
    MEDALLION1,
    START_MICROS1,
    NEXT_TS1,
    MEDALLION2,
    START_MICROS2,
    NEXT_TS2,
    keyPair,
} from "./test_utils";
import {
    muidToBuilder,
    ensure,
    wrapValue,
    matches,
    wrapKey,
    signBundle,
    generateTimestamp,
    muidToString,
} from "../implementation/utils";
import { Bundler, Database } from "../implementation";

// makes an empty Store for testing purposes
export type StoreMaker = () => Promise<Store>;

// Jest complains if there's a test suite without a test.
it("placeholder", () => {
    expect(1 + 2).toBe(3);
});

/**
 *
 * @param storeMaker must return a fresh (empty) store on each invocation
 * @param implName name of this implementation
 * @param replacer thing to check when using persistence
 */
export function testStore(
    implName: string,
    storeMaker: StoreMaker,
    replacer?: StoreMaker
) {
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
        const chainStart = await makeChainStart(
            "Hello, World!",
            MEDALLION1,
            START_MICROS1
        );
        const secondTrxn = await extendChain(
            "Hello, again!",
            chainStart,
            NEXT_TS1
        );
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
        const chainStart = await makeChainStart(
            "Hello, World!",
            MEDALLION1,
            START_MICROS1
        );
        const secondTrxn = await extendChain(
            "Hello, again!",
            chainStart,
            NEXT_TS1
        );
        const thirdTrxn = await extendChain(
            "Hello, a third!",
            secondTrxn,
            NEXT_TS1 + 1
        );
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

        expect(
            hasMap.getBundleInfo([MEDALLION1, START_MICROS1])!.timestamp
        ).toBe(NEXT_TS1);
        expect(
            hasMap.getBundleInfo([MEDALLION2, START_MICROS2])!.timestamp
        ).toBe(NEXT_TS2);
    });

    it(`${implName} test sends trxns in order`, async () => {
        await addTrxns(store);
        if (replacer) {
            await store.close();
            store = await replacer();
        }
        const sent: Array<BundleBytes> = [];
        await store.getBundles((x: BundleView) => {
            sent.push(x.bytes);
        });
        expect(sent.length).toBe(4);
        expect(unbundle(sent[0]).getTimestamp()).toBe(START_MICROS1);
        expect(unbundle(sent[1]).getTimestamp()).toBe(START_MICROS2);
        expect(unbundle(sent[2]).getTimestamp()).toBe(NEXT_TS1);
        expect(unbundle(sent[3]).getTimestamp()).toBe(NEXT_TS2);
    });

    it(`${implName} test save/fetch container`, async () => {
        const bundleBuilder = new BundleBuilder();
        bundleBuilder.setChainStart(START_MICROS1);
        bundleBuilder.setTimestamp(START_MICROS1);
        bundleBuilder.setMedallion(MEDALLION1);
        bundleBuilder.setVerifyKey((await keyPair).publicKey);
        bundleBuilder.setIdentity("test-container");
        const changeBuilder = new ChangeBuilder();
        const containerBuilder = new ContainerBuilder();
        containerBuilder.setBehavior(Behavior.DIRECTORY);
        changeBuilder.setContainer(containerBuilder);
        bundleBuilder.getChangesList().push(changeBuilder);
        const decomposition = new Decomposition(
            signBundle(
                bundleBuilder.serializeBinary(),
                (await keyPair).secretKey
            )
        );
        await store.addBundle(decomposition);
        ensure(decomposition.info.medallion === MEDALLION1);
        ensure(decomposition.info.timestamp === START_MICROS1);
        const containerBytes = await store.getContainerBytes({
            medallion: MEDALLION1,
            timestamp: START_MICROS1,
            offset: 1,
        });
        ensure(containerBytes);
        const containerBuilder2 = <ContainerBuilder>(
            ContainerBuilder.deserializeBinary(containerBytes)
        );
        ensure(containerBuilder2.getBehavior() === Behavior.DIRECTORY);
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
        bundler.seal(
            { medallion: 4, chainStart: 5, timestamp: 5 },
            await keyPair,
            undefined,
            "test"
        );
        await store.addBundle(bundler);
        ensure(address.medallion === 4);
        ensure(address.timestamp === 5);
        const entry = <Entry>await store.getEntryByKey(sourceAddress, "abc");
        ensure(entry);
        ensure(matches(entry.containerId, [2, 1, 3]));
        ensure(matches(entry.entryId, [5, 4, 1]));
        ensure(entry.value === "xyz");
        ensure(entry.storageKey === "abc");
    });

    it(`${implName} getChainIdentity works`, async () => {
        const db = new Database(store, "test@identity");
        await db.ready;
        ensure((await store.getClaimedChains()).size === 0);
        await db.getGlobalDirectory().set(3, 4);
        const chain = [...(await store.getClaimedChains()).entries()][0][1];
        const identity = await store.getChainIdentity([
            chain.medallion,
            chain.chainStart,
        ]);
        ensure(identity === "test@identity");
    });

    it(`${implName} getContainersByName`, async () => {
        const db = new Database(store, "test@byName");
        await db.ready;
        const gd = db.getGlobalDirectory();
        await gd.setName("foo");
        const d2 = await db.createDirectory();
        await d2.setName("bar");
        const seq = await db.createSequence();
        await seq.setName("bar");
        const fooContainers = await store.getContainersByName("foo");
        ensure(fooContainers.length === 1);
        ensure(fooContainers[0].timestamp === gd.timestamp);
        ensure(fooContainers[0].medallion === gd.medallion);
        const barContainers = await store.getContainersByName("bar");
        ensure(barContainers.length === 2);
        ensure(barContainers[0].timestamp === d2.timestamp);
        ensure(barContainers[0].medallion === d2.medallion);
        ensure(barContainers[1].timestamp === seq.timestamp);
        ensure(barContainers[1].medallion === seq.medallion);
        await seq.setName("baz");
        const barContainers2 = await store.getContainersByName("bar");
        ensure(barContainers2.length === 1);
        ensure(barContainers2[0].timestamp === d2.timestamp);
        ensure(barContainers2[0].medallion === d2.medallion);
        const bazContainers = await store.getContainersByName("baz");
        ensure(bazContainers.length === 1);
        ensure(bazContainers[0].timestamp === seq.timestamp);
        ensure(bazContainers[0].medallion === seq.medallion);
        await seq.setName("last");
        const bazContainers2 = await store.getContainersByName("baz");
        ensure(bazContainers2.length === 0);
        const lastContainers = await store.getContainersByName("last");
        ensure(lastContainers.length === 1);
        ensure(lastContainers[0].timestamp === seq.timestamp);
        ensure(lastContainers[0].medallion === seq.medallion);
    });

    it(`${implName} bundle properly handles identities`, async () => {
        await store.ready;
        // Try to add a start a chain without an identity
        const kp1 = await keyPair;
        const bundleBuilder = new BundleBuilder();
        bundleBuilder.setChainStart(START_MICROS1);
        bundleBuilder.setTimestamp(START_MICROS1);
        bundleBuilder.setMedallion(MEDALLION1);
        bundleBuilder.setComment("should error");
        bundleBuilder.setVerifyKey(kp1.publicKey);
        const decomp = new Decomposition(
            signBundle(bundleBuilder.serializeBinary(), kp1.secretKey)
        );
        let errored = false;
        try {
            await store.addBundle(decomp);
        } catch {
            errored = true;
        }
        ensure(errored, "chain start bundle allowed without identity?");
        // Add a chain start with an identity
        const decomp2 = await makeChainStart(
            "should not error",
            MEDALLION2,
            START_MICROS2
        );
        const added = await store.addBundle(decomp2);
        ensure(added, "adding chain start bundle with identity failed");
        // Now identities should not be allowed for subsequent bundles
        const kp3 = await keyPair;
        const bundleBuilder3 = new BundleBuilder();
        const parsedPrevious = decomp2.info;
        bundleBuilder3.setMedallion(parsedPrevious.medallion);
        bundleBuilder3.setPrevious(parsedPrevious.timestamp);
        bundleBuilder3.setChainStart(parsedPrevious.chainStart);
        bundleBuilder3.setTimestamp(NEXT_TS1);
        bundleBuilder3.setComment("should error again");
        bundleBuilder3.setVerifyKey(kp3.publicKey);
        bundleBuilder3.setIdentity("error-identity");
        const priorHash = decomp2.info.hashCode;
        ensure(priorHash && priorHash.length === 32);
        bundleBuilder3.setPriorHash(priorHash);
        const decomp3 = new Decomposition(
            signBundle(bundleBuilder3.serializeBinary(), kp3.secretKey)
        );
        let errored2 = false;
        try {
            await store.addBundle(decomp3);
        } catch {
            errored2 = true;
        }
        ensure(errored2, "chain extension bundle allowed with identity?");
    });

    it(`${implName} getContainerProperties`, async () => {
        await store.ready;
        const database = new Database(store);
        await database.ready;

        const dir = database.getGlobalDirectory();
        await dir.set("foo", "bar");

        const prop = await database.createProperty();
        await prop.set(dir, "bar");

        const prop2 = await database.createProperty();
        await prop2.set(dir, "baz");

        const box = await database.createBox();
        await prop.set(box, "box");
        const after = generateTimestamp();

        const properties = await store.getContainerProperties(dir.address);
        ensure(properties.size === 2);
        ensure(properties.get(muidToString(prop.address)) === "bar");
        ensure(properties.get(muidToString(prop2.address)) === "baz");

        // Test asOf
        prop.set(dir, "bar2");
        prop2.set(dir, "baz2");
        const prop3 = await database.createProperty();
        await prop3.set(dir, "baz3");
        const properties2 = await store.getContainerProperties(dir.address);

        ensure(properties2.size === 3);
        ensure(properties2.get(muidToString(prop.address)) === "bar2");
        ensure(properties2.get(muidToString(prop2.address)) === "baz2");
        ensure(properties2.get(muidToString(prop3.address)) === "baz3");

        const asOfProperties = await store.getContainerProperties(
            dir.address,
            after
        );
        ensure(asOfProperties.size === 2);
        ensure(asOfProperties.get(muidToString(prop.address)) === "bar");
        ensure(asOfProperties.get(muidToString(prop2.address)) === "baz");
    });
}
