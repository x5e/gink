import {
    Database,
    IndexedDbStore,
    Bundler,
    MemoryStore,
} from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("test bundle", async () => {
    for (const store of [
        new IndexedDbStore("Database.bundle", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const bundleInfo = await instance.addBundler(
            new Bundler("hello world")
        );
        ensure(bundleInfo.comment === "hello world");
        const chainTracker = await store.getChainTracker();
        const allChains = chainTracker.getChains();
        ensure(allChains.length === 1);
        ensure(allChains[0][0] === bundleInfo.medallion);
        ensure(allChains[0][1] === bundleInfo.chainStart);
    }
});

it("test listeners", async () => {
    for (const store of [
        new IndexedDbStore("Database.listeners.test", true),
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

it("test container naming", async function () {
    for (const store of [
        new IndexedDbStore("Database.naming.test", true),
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

        ensure((await root.getName()) === "root");
        ensure((await seq1.getName()) === "seq");

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

it("test resetContainerProperties", async function () {
    for (const store of [
        new IndexedDbStore("Database.propertyReset.test", true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const db = new Database(store);
        await db.ready;

        const root = db.getGlobalDirectory();
        const prop1 = await db.createProperty();
        const prop2 = await db.createProperty();
        await prop1.set(root, "foo");
        await prop2.set(root, "bar");
        await root.setName("root");
        const resetTo = generateTimestamp();
        await prop1.set(root, "foo2");
        await prop2.set(root, "bar2");
        const prop3 = await db.createProperty();
        await prop3.set(root, "baz2");
        await root.setName("root2");
        ensure((await prop1.get(root)) === "foo2");
        ensure((await prop2.get(root)) === "bar2");
        ensure((await prop3.get(root)) === "baz2");
        ensure((await root.getName()) === "root2");
        await db.resetContainerProperties(root, resetTo);
        ensure((await prop1.get(root)) === "foo");
        ensure((await prop2.get(root)) === "bar");
        ensure((await prop3.get(root)) === undefined);
        ensure((await root.getName()) === "root");
        // clear all properties
        await db.resetContainerProperties(root);
        ensure((await prop1.get(root)) === undefined);
        ensure((await prop2.get(root)) === undefined);
        ensure((await prop3.get(root)) === undefined);
        ensure((await root.getName()) === undefined);

        // Same test with non-global container
        const seq = await db.createSequence();
        const prop1Seq = await db.createProperty();
        const prop2Seq = await db.createProperty();
        await prop1Seq.set(seq, "foo");
        await prop2Seq.set(seq, "bar");
        await seq.setName("seq");
        const resetToSeq = generateTimestamp();
        await prop1Seq.set(seq, "foo2");
        await prop2Seq.set(seq, "bar2");
        const prop3Seq = await db.createProperty();
        await prop3Seq.set(seq, "baz2");
        await seq.setName("seq2");
        ensure((await prop1Seq.get(seq)) === "foo2");
        ensure((await prop2Seq.get(seq)) === "bar2");
        ensure((await prop3Seq.get(seq)) === "baz2");
        ensure((await seq.getName()) === "seq2");
        await db.resetContainerProperties(seq, resetToSeq);
        ensure((await prop1Seq.get(seq)) === "foo");
        ensure((await prop2Seq.get(seq)) === "bar");
        ensure((await prop3Seq.get(seq)) === undefined);
        ensure((await seq.getName()) === "seq");

        const propValues = Array.from(
            (await db.store.getContainerProperties(seq)).values()
        );
        ensure(propValues.length === 3);
        ensure(propValues.find((v) => v === "foo") !== undefined);
        ensure(propValues.find((v) => v === "bar") !== undefined);
        ensure(propValues.find((v) => v === "seq") !== undefined);
        ensure(propValues.find((v) => v === "baz2") === undefined);

        // clear all properties
        await db.resetContainerProperties(seq);
        ensure((await prop1Seq.get(seq)) === undefined);
        ensure((await seq.getName()) === undefined);
        ensure((await prop2Seq.get(seq)) === undefined);
    }
});

it("test full database reset", async function () {
    for (const store of [
        new IndexedDbStore("Database.reset.test", true),
        new MemoryStore(true),
    ]) {
        await store.ready;
        const db = new Database(store);
        await db.ready;
        const prop = await db.createProperty();

        const root = db.getGlobalDirectory();
        const seq = await db.createSequence();
        const box = await db.createBox();
        const ks = await db.createKeySet();
        const ps = await db.createPairSet();
        const group = await db.createGroup();

        await root.set("foo", "bar");
        await seq.push("foo");
        await box.set("foo");
        await ks.add("foo");
        await ps.include([root, seq]);
        await group.include(root);

        await prop.set(root, "foo");
        await prop.set(seq, "foo");
        await prop.set(box, "foo");
        await prop.set(ks, "foo");
        await prop.set(ps, "foo");
        await prop.set(group, "foo");

        await root.setName("root");
        await seq.setName("seq");
        await box.setName("box");
        await ks.setName("ks");
        await ps.setName("ps");
        await group.setName("group");

        const resetTo = generateTimestamp();

        await root.set("foo", "changed");
        await seq.push("changed");
        await box.set("changed");
        await ks.add("changed");
        await ps.exclude([root, seq]);
        await group.exclude(root);

        await prop.set(root, "changed");
        await prop.set(seq, "changed");
        await prop.set(box, "changed");
        await prop.set(ks, "changed");
        await prop.set(ps, "changed");
        await prop.set(group, "changed");

        await root.setName("root2");
        await seq.setName("seq2");
        await box.setName("box2");
        await ks.setName("ks2");
        await ps.setName("ps2");
        await group.setName("group2");

        const afterChanges = generateTimestamp();

        await db.reset(resetTo);

        ensure((await root.get("foo")) === "bar");
        ensure((await seq.at(0)) === "foo");
        ensure((await box.get()) === "foo");
        ensure(await ks.has("foo"));
        ensure(await ps.contains([root, seq]));
        ensure(await group.isIncluded(root));

        ensure((await prop.get(root)) === "foo");
        ensure((await prop.get(seq)) === "foo");
        ensure((await prop.get(box)) === "foo");
        ensure((await prop.get(ks)) === "foo");
        ensure((await prop.get(ps)) === "foo");
        ensure((await prop.get(group)) === "foo");

        ensure((await root.getName()) === "root");
        ensure((await seq.getName()) === "seq");
        ensure((await box.getName()) === "box");
        ensure((await ks.getName()) === "ks");
        ensure((await ps.getName()) === "ps");
        ensure((await group.getName()) === "group");

        await db.reset();

        ensure((await root.get("foo")) === undefined);
        ensure((await seq.at(0)) === undefined);
        ensure((await box.get()) === undefined);
        ensure(!(await ks.has("foo")));
        ensure(!(await ps.contains([root, seq])));
        ensure(!(await group.isIncluded(root)));

        ensure((await prop.get(root)) === undefined);
        ensure((await prop.get(seq)) === undefined);
        ensure((await prop.get(box)) === undefined);
        ensure((await prop.get(ks)) === undefined);
        ensure((await prop.get(ps)) === undefined);
        ensure((await prop.get(group)) === undefined);

        ensure((await root.getName()) === undefined);
        ensure((await seq.getName()) === undefined);
        ensure((await box.getName()) === undefined);
        ensure((await ks.getName()) === undefined);
        ensure((await ps.getName()) === undefined);
        ensure((await group.getName()) === undefined);

        await db.reset(afterChanges);

        ensure((await root.get("foo")) === "changed");
        ensure((await seq.at(1)) === "changed");
        ensure((await box.get()) === "changed");
        ensure(await ks.has("changed"));
        ensure(!(await ps.contains([root, seq])));
        ensure(!(await group.isIncluded(root)));

        ensure((await prop.get(root)) === "changed");
        ensure((await prop.get(seq)) === "changed");
        ensure((await prop.get(box)) === "changed");
        ensure((await prop.get(ks)) === "changed");
        ensure((await prop.get(ps)) === "changed");
        ensure((await prop.get(group)) === "changed");

        ensure((await root.getName()) === "root2");
        ensure((await seq.getName()) === "seq2");
        ensure((await box.getName()) === "box2");
        ensure((await ks.getName()) === "ks2");
        ensure((await ps.getName()) === "ps2");
        ensure((await group.getName()) === "group2");

        await root.delete("foo");
        await seq.pop(); // should still have foo
        await box.clear();
        await ks.delete("changed");
        await ps.include([ks, group]);
        await group.include(seq);

        await db.reset(resetTo);

        ensure((await root.get("foo")) === "bar");
        ensure((await seq.at(0)) === "foo");
        ensure((await box.get()) === "foo");
        ensure(await ks.has("foo"));
        ensure(await ps.contains([root, seq]));
        ensure(await group.isIncluded(root));

        ensure((await prop.get(root)) === "foo");
        ensure((await prop.get(seq)) === "foo");
        ensure((await prop.get(box)) === "foo");
        ensure((await prop.get(ks)) === "foo");
        ensure((await prop.get(ps)) === "foo");
        ensure((await prop.get(group)) === "foo");

        ensure((await root.getName()) === "root");
        ensure((await seq.getName()) === "seq");
        ensure((await box.getName()) === "box");
        ensure((await ks.getName()) === "ks");
        ensure((await ps.getName()) === "ps");
        ensure((await group.getName()) === "group");
    }
});

export const result = 1;
