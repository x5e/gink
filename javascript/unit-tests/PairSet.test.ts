import { Database, IndexedDbStore, MemoryStore, Box } from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";
import { sleep } from "./test_utils";

it("include, exclude, and contains work as intended", async function () {
    for (const store of [
        new IndexedDbStore("PS.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const ps1 = await instance.createPairSet();
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const box3 = await Box.create(instance);

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
        const instance = new Database({store});
        await instance.ready;
        const ps1 = await instance.createPairSet();
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const box3 = await Box.create(instance);

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

it("PairSet.reset", async function () {
    for (const store of [
        new IndexedDbStore("ps-test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const ps = await instance.createPairSet();
        await ps.include([box1, box2]);
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(ps, "foo");
        await prop2.set(ps, "bar");
        const afterOne = generateTimestamp();
        await ps.include([box2, box1]);
        await prop1.set(ps, "foo2");
        await prop2.set(ps, "bar2");
        ensure(await ps.contains([box2, box1]));
        await ps.reset({ toTime: afterOne });
        ensure(!(await ps.contains([box2, box1])));
        ensure(await ps.contains([box1, box2]));
        ensure((await prop1.get(ps)) === "foo");
        ensure((await prop2.get(ps)) === "bar");
        await ps.reset();
        ensure((await ps.size()) === 0);
        await ps.include([box1, box2]);
        await ps.include([box2, box1]);
        ensure((await prop1.get(ps)) === undefined);
        ensure((await prop2.get(ps)) === undefined);
        const beforeExclude = generateTimestamp();
        await ps.exclude([box1, box2]);
        await ps.reset({ toTime: beforeExclude, skipProperties: true });
        ensure(await ps.contains([box1, box2]));
        ensure(await ps.contains([box2, box1]));
        ensure((await prop1.get(ps)) === undefined);
        ensure((await prop2.get(ps)) === undefined);
    }
});
