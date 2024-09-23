import {
    Database,
    ensure,
    generateTimestamp,
    IndexedDbStore,
    MemoryStore,
} from "../implementation";

it("test resetProperties", async function () {
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
        await root.resetProperties(resetTo);
        ensure((await prop1.get(root)) === "foo");
        ensure((await prop2.get(root)) === "bar");
        ensure((await prop3.get(root)) === undefined);
        ensure((await root.getName()) === "root");
        // clear all properties
        await root.resetProperties();
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
        await seq.resetProperties(resetToSeq);
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
        await seq.resetProperties();
        ensure((await prop1Seq.get(seq)) === undefined);
        ensure((await seq.getName()) === undefined);
        ensure((await prop2Seq.get(seq)) === undefined);
    }
});
