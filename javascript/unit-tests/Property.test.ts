import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, sameData } from "../implementation/utils";

it("Property.basics", async function () {
    for (const store of [
        new IndexedDbStore("Property.basics", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const gd = instance.getGlobalDirectory();
        const property = await instance.createProperty();
        await property.set(gd, "foobar");
        const gotten = await property.get(gd);
        ensure(gotten === "foobar", `gotten=${gotten}`);
        const gp = instance.getGlobalProperty();
        await property.set(gp, [1, 2, 3]);
        const gotten2 = await property.get(gp);
        ensure(sameData(gotten2, [1, 2, 3]));

        const clearMuid = await property.clear();
        const hasGp = await property.has(gd);
        ensure(hasGp === false);
        const fromBefore = await property.get(gd, clearMuid.timestamp);
        ensure(fromBefore === "foobar");
    }
});

it("Property.toMap", async function () {
    for (const store of [
        new IndexedDbStore("Property.toMap", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const gd = instance.getGlobalDirectory();
        const property = instance.getGlobalProperty();
        await property.set(gd, "foobar");
        await property.set(property, true);
        const asMap = await property.toMap();
        const asObject = Object.fromEntries(asMap.entries());
        ensure(asMap.size === 2);
        ensure(
            asObject["-1,-1,4"] === "foobar",
            Array.from(asMap.keys()).toString()
        );
        ensure(
            asObject["-1,-1,10"] === true,
            Array.from(asMap.keys()).toString()
        );
    }
});
