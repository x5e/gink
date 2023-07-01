import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure, muidToString, muidTupleToMuid } from "../implementation/utils";

test('include and exclude work as intended', async function() {
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const ps1 = await instance.createPairSet();
    const box1 = await instance.createBox();
    const box2 = await instance.createBox();

    await ps1.include([box1, box2]);
    ensure(await ps1.size() == 1, `${await ps1.size()}`);

    await ps1.exclude([box1, box2]);
    ensure(await ps1.size()==0);
});
