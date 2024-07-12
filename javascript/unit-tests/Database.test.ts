import { Database, IndexedDbStore, Bundler, MemoryStore } from "../implementation";
import { SimpleServer } from "../implementation/SimpleServer";
import { ensure } from "../implementation/utils";

it('test bundle', async () => {
    for (const store of [new IndexedDbStore('Database.bundle', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const bundleInfo = await instance.addBundler(new Bundler("hello world"));
        ensure(bundleInfo.comment === "hello world");
        const chainTracker = await store.getChainTracker();
        const allChains = chainTracker.getChains();
        ensure(allChains.length === 1);
        ensure(allChains[0][0] === bundleInfo.medallion);
        ensure(allChains[0][1] === bundleInfo.chainStart);
    }
});

it('test listeners', async () => {
    for (const store of [
        new IndexedDbStore('Database.listeners.test', true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const db = new Database(store);
        await db.ready;

        const root = db.getGlobalDirectory();
        const sequence = await db.createSequence();
        const box = await db.createBox();

        const rootListener = async () => {
            rootListener.calledTimes++;
        };
        rootListener.calledTimes = 0;

        const allContainersListener = async () => {
            allContainersListener.calledTimes++;
        };
        allContainersListener.calledTimes = 0;

        db.addListener(rootListener, root.address);
        db.addListener(allContainersListener);

        await root.set("foo", "bar");
        await sequence.push("foo");
        await box.set("test");

        ensure(rootListener.calledTimes === 1);
        ensure(allContainersListener.calledTimes === 3);

        await root.clear();
        ensure(rootListener.calledTimes === 2);
    }
});

it('test container naming', async function () {
    for (const store of [
        new IndexedDbStore('Database.naming.test', true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const db = new Database(store);
        await db.ready;

        const root = db.getGlobalDirectory();
        const seq1 = await db.createSequence();
        const seq2 = await db.createSequence();
        const seq3 = await db.createSequence();

        await root.setName("root");
        await seq1.setName("seq");
        await seq2.setName("seq");
        await seq3.setName("seq");

        ensure(await root.getName() === "root");
        ensure(await seq1.getName() === "seq");

        const rootContainers = await db.getContainersWithName("root");
        ensure(rootContainers.length === 1);
        ensure(root.address.timestamp === rootContainers[0].timestamp);
        ensure(root.address.medallion === rootContainers[0].medallion);
        ensure(root.address.offset === rootContainers[0].offset);

        const seqContainers = await db.getContainersWithName("seq");
        ensure(seqContainers.length === 3);
        ensure(seq1.address.timestamp === seqContainers[0].timestamp);
        ensure(seq1.address.medallion === seqContainers[0].medallion);
        ensure(seq1.address.offset === seqContainers[0].offset);

        ensure(seq3.address.timestamp === seqContainers[2].timestamp);
        ensure(seq3.address.medallion === seqContainers[2].medallion);
        ensure(seq3.address.offset === seqContainers[2].offset);
    }
});

export const result = 1;
