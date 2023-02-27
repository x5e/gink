import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure } from "../implementation/utils"

test('complex.toJSON', async function () {
    const instance = new GinkInstance(new IndexedDbStore('toJSON', true));
    const directory = await instance.createDirectory();

    await directory.set("foo", "bar");
    await directory.set("bar", 3);

    await directory.set("document", (new Map())
        .set("a date", new Date(1665892249196))
        .set("some bytes", new Uint8Array([94, 32]))
        .set("an array", [1, 3, true, false, null])
        .set("sub object", (new Map()).set("key", "value"))
    );

    await directory.set("tuple", ["yes"]);

    const asJson = await directory.toJson();
    const expected = `{"bar":3,"document":{"a date":"2022-10-16T03:50:49.196Z","an array":[1,3,` + 
        `true,false,null],"some bytes":"5E20","sub object":{"key":"value"}},"foo":"bar","tuple":["yes"]}`;
    ensure(asJson == expected, asJson);
});
