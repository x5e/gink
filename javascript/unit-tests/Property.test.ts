import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, Directory } from "../implementation";
import { ensure, sameData } from "../implementation/utils"

test('Property.basics', async function () {
    const instance = new GinkInstance(new IndexedDbStore('Property.basics', true));
    const gd = instance.getGlobalDirectory();
    const property = await instance.createProperty();
    await property.set(gd, "foobar");
    const gotten = await property.get(gd);
    ensure(gotten == "foobar");
    const gp = instance.getGlobalProperty();
    await property.set(gp, [1, 2, 3]);
    const gotten2 = await property.get(gp);
    ensure(sameData(gotten2, [1, 2, 3]));
    const clearMuid = await property.clear();
    const hasGp = await property.has(gd);
    ensure(hasGp === false);
    const fromBefore = await property.get(gd, clearMuid.timestamp);
    ensure(fromBefore == "foobar");
});