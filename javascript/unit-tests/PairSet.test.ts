import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure, muidToString, muidTupleToMuid, stringToMuid } from "../implementation/utils";

test('include, exclude, and contains work as intended', async function() {
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const ps1 = await instance.createPairSet();
    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    const box3 = await instance.createBox();

    await ps1.include([box1, box2]);
    ensure(await ps1.size() == 1, `${await ps1.size()}`);
    ensure(await ps1.contains([box1, box2]));

    await ps1.include([box2, box3]);
    ensure(await ps1.size() == 2);
    ensure(await ps1.contains([box2, box3]));

    await ps1.exclude([box1, box2]);
    ensure(await ps1.size()==1);
    ensure(!(await ps1.contains([box1, box2])));
});

test('asOf and get_pairs work properly', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const ps1 = await instance.createPairSet();
    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    const box3 = await instance.createBox();

    await ps1.include([box1, box2]);
    await ps1.include([box2, box3]);
    const time1 = Date.now() * 1000;
    await ps1.include([box1, box3]);
    ensure(await ps1.contains([box1, box2], time1));
    ensure(!await ps1.contains([box1, box3], time1));

    const toSet = await ps1.get_pairs();
    ensure(toSet.size == 3);
});
