import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure } from "../implementation/utils";

it('complex.toJSON', async function () {
    const instance = new GinkInstance(new IndexedDbStore('toJSON', true));
    const directory = await instance.createDirectory();

    await directory.set("foo", "bar");
    await directory.set("bar", 3);

    const a_document = (new Map())
        .set("a date", new Date(1665892249196))
        .set("some bytes", new Uint8Array([94, 32]))
        .set("an array", [1, 3, true, false, null])
        .set("sub object", (new Map()).set("key", "value"));

    if (!(a_document instanceof Map)) {
        throw Error("unexpected");
    }

    await directory.set("document", a_document);

    await directory.set("tuple", ["yes"]);

    const asJson = await directory.toJson();
    const expected = `{"bar":3,"document":{"a date":"2022-10-16T03:50:49.196Z","an array":[1,3,` +
        `true,false,null],"some bytes":"5E20","sub object":{"key":"value"}},"foo":"bar","tuple":["yes"]}`;
    ensure(asJson == expected, asJson);

    // TODO: figure out why Map objects don't come out properly
    const pulledOut = await directory.get("document");
    ensure(pulledOut[Symbol.toStringTag] === "Map"); // true
    // ensure(pulledOut instanceof Map); // false
});


it('various.contents', async function () {
    const instance = new GinkInstance(new IndexedDbStore('contents', true));
    const box = await instance.createBox();
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
});
