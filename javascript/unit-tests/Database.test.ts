import { Database, IndexedDbStore, Bundler, BundleInfo, MemoryStore } from "../implementation";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { ensure } from "../implementation/utils";
import { BundleBytes } from "../implementation/typedefs";
import { BundleBuilder } from "../implementation/builders";

it('test commit', async () => {
    for (const store of [new IndexedDbStore('Database.commit', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const commitInfo = await instance.addBundler(new Bundler("hello world"));
        ensure(commitInfo.comment == "hello world");
        const chainTracker = await store.getChainTracker();
        const allChains = chainTracker.getChains();
        ensure(allChains.length == 1);
        ensure(allChains[0][0] == commitInfo.medallion);
        ensure(allChains[0][1] == commitInfo.chainStart);
    }
});

it('uses claimed chain', async () => {
    for (const store of [
        new IndexedDbStore('Database.test', true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const commitBytes = makeChainStart("test@identity", MEDALLION1, START_MICROS1);
        await store.claimChain(MEDALLION1, START_MICROS1);
        await store.addBundle(commitBytes);

        await store.getCommits((commitBytes: BundleBytes, _commitInfo: BundleInfo) => {
            const commit = <BundleBuilder>BundleBuilder.deserializeBinary(commitBytes);
            ensure(commit.getComment() == "test@identity");
        });
        const instance = new Database(store, "test@identity");
        await instance.ready;
        const secondInfo = await instance.addBundler(new Bundler("Hello, Universe!"));
        ensure(
            secondInfo.medallion == MEDALLION1 &&
            secondInfo.priorTime == START_MICROS1 &&
            secondInfo.chainStart == START_MICROS1
        );
    }
});

it('test listeners', async () => {
    for (const store of [
        new IndexedDbStore('Database.listeners.test', true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const instance = new Database(store);
        await instance.ready;

        const globalDir = instance.getGlobalDirectory();
        const sequence = await instance.createSequence();
        const box = await instance.createBox();

        const globalDirListener = async () => {
            globalDirListener.calledTimes++;
        };
        globalDirListener.calledTimes = 0;

        const allContainersListener = async () => {
            allContainersListener.calledTimes++;
        };
        allContainersListener.calledTimes = 0;

        instance.addListener(globalDirListener, globalDir.address);
        instance.addListener(allContainersListener);

        await globalDir.set("foo", "bar");
        await sequence.push("foo");
        await box.set("test");

        ensure(globalDirListener.calledTimes == 1);
        ensure(allContainersListener.calledTimes == 3);
    }
});

export const result = 1;
