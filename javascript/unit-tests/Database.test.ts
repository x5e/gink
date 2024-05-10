import { Database, IndexedDbStore, Bundler, BundleInfo, MemoryStore } from "../implementation";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { ensure } from "../implementation/utils";
import { BundleBytes } from "../implementation/typedefs";
import { BundleBuilder } from "../implementation/builders";

it('test bundle', async () => {
    for (const store of [new IndexedDbStore('Database.bundle', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const bundleInfo = await instance.addBundler(new Bundler("hello world"));
        ensure(bundleInfo.comment == "hello world");
        const chainTracker = await store.getChainTracker();
        const allChains = chainTracker.getChains();
        ensure(allChains.length == 1);
        ensure(allChains[0][0] == bundleInfo.medallion);
        ensure(allChains[0][1] == bundleInfo.chainStart);
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
