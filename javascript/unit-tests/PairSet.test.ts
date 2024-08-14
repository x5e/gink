import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure } from "../implementation/utils";
import { sleep } from "./test_utils";

it("include, exclude, and contains work as intended", async function () {
    for (const store of [
        new IndexedDbStore("PS.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const ps1 = await instance.createPairSet();
        const box1 = await instance.createBox();
        const box2 = await instance.createBox();
        const box3 = await instance.createBox();

        await ps1.include([box1, box2]);
        ensure((await ps1.size()) === 1, `${await ps1.size()}`);
        ensure(await ps1.contains([box1, box2]));

        await ps1.include([box2, box3]);
        ensure((await ps1.size()) === 2);
        ensure(await ps1.contains([box2, box3]));

        await ps1.exclude([box1, box2]);
        ensure((await ps1.size()) === 1);
        ensure(!(await ps1.contains([box1, box2])));

        await ps1.include([box1, box2]);
        ensure((await ps1.size()) === 2);
        ensure(await ps1.contains([box1.address, box2]));
        ensure(await ps1.contains([box1, box2.address]));
    }
});

it("asOf and getPairs work properly", async function () {
    for (const store of [
        new IndexedDbStore("PS.test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const ps1 = await instance.createPairSet();
        const box1 = await instance.createBox();
        const box2 = await instance.createBox();
        const box3 = await instance.createBox();

        await ps1.include([box1, box2]);
        await sleep(10);
        const time0 = Date.now() * 1000;
        await sleep(10);
        await ps1.include([box2, box3]);
        await sleep(10);
        const time1 = Date.now() * 1000;
        await sleep(10);
        await ps1.include([box1, box3]);
        await sleep(10);
        ensure(await ps1.contains([box1, box2], time1));
        ensure(!(await ps1.contains([box1, box3], time1)));

        const toSet = await ps1.getPairs();
        ensure(toSet.size === 3);

        const asOfSet = await ps1.getPairs(time0);
        ensure(asOfSet.size === 1);

        ensure((await ps1.size(time0)) === 1);
        ensure(!(await ps1.contains([box1, box3], time0)));
    }
});
