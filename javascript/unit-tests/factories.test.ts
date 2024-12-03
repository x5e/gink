import { Database, IndexedDbStore, MemoryStore, Box } from "../implementation";
import { ensure } from "../implementation/utils";

it("complex.toJSON", async function () {
    for (const store of [
        new IndexedDbStore("toJSON", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const directory = await instance.createDirectory();

        await directory.set("foo", "bar");
        await directory.set("bar", 3);

        const a_document = new Map()
            .set("a date", new Date(1665892249196))
            .set("some bytes", new Uint8Array([94, 32]))
            .set("an array", [1, 3, true, false, null])
            .set("sub object", new Map().set("key", "value"));

        if (!(a_document instanceof Map)) {
            throw Error("unexpected");
        }

        await directory.set("document", a_document);

        await directory.set("tuple", ["yes"]);

        const asJson = await directory.toJson();
        const fromJson = JSON.parse(asJson);
        // This is a little awkward, but MemoryStore holds entries in order,
        // so toJson comes out in a different order than IndexedDb.
        ensure(fromJson.foo === "bar", fromJson.foo);
        ensure(fromJson.bar === 3, fromJson.bar);
        ensure(
            fromJson.document["a date"] === "2022-10-16T03:50:49.196Z",
            fromJson.document
        );
        // null won't be included in array.toString()
        ensure(
            fromJson.document["an array"].toString() === "1,3,true,false,",
            fromJson.document["an array"].toString()
        );
        ensure(
            fromJson.document["some bytes"].toString() === "5E20",
            fromJson.document
        );
        ensure(
            fromJson.document["sub object"].key === "value",
            fromJson.document
        );
        ensure(fromJson.tuple.toString() === "yes", fromJson.tuple);

        // TODO: figure out why Map objects don't come out properly
        const pulledOut = await directory.get("document");
        ensure(pulledOut[Symbol.toStringTag] === "Map"); // true
        // ensure(pulledOut instanceof Map); // false
    }
});

it("various.contents", async function () {
    for (const store of [
        new IndexedDbStore("contents", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const box = await Box.create(instance);
        const property = await instance.createProperty();

        await box.set(property);
        let found = await box.get();
        ensure(property.equals(found));

        const pairSet = await instance.createPairSet();
        await box.set(pairSet);
        found = await box.get();
        ensure(pairSet.equals(found));

        const directory = await instance.getGlobalDirectory();
        await box.set(directory);
        found = await box.get();
        ensure(directory.equals(found));
    }
});
