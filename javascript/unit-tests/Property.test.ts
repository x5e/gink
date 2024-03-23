import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, muidToString, sameData } from "../implementation/utils";

it('Property.basics', async function () {
    for (const store of [new IndexedDbStore('Property.basics', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const gd = instance.getGlobalDirectory();
        const property = await instance.createProperty();
        await property.set(gd, "foobar");
        const gotten = await property.get(gd);
        ensure(gotten == "foobar", `gotten=${gotten}`);
        const gp = instance.getGlobalProperty();
        await property.set(gp, [1, 2, 3]);
        const gotten2 = await property.get(gp);
        ensure(sameData(gotten2, [1, 2, 3]));

        const allEntries = await property.getAll();
        ensure(allEntries.get(muidToString(gd.address)).value == "foobar");
        ensure(allEntries.get(muidToString(gp.address)).value.toString() == "1,2,3");

        const clearMuid = await property.clear();
        const hasGp = await property.has(gd);
        ensure(hasGp === false);
        const fromBefore = await property.get(gd, clearMuid.timestamp);
        ensure(fromBefore == "foobar");
    }
});
