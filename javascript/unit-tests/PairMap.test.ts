import {
    Database,
    IndexedDbStore,
    MemoryStore,
    Box,
    PairMap,
} from "../implementation";
import { ensure } from "../implementation/utils";
import { sleep } from "./test_utils";

it("set, get, delete, and size work as intended", async function () {
    for (const store of [
        new IndexedDbStore("PM.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const pm1 = await PairMap.create(instance);
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const box3 = await Box.create(instance);

        ensure((await pm1.size()) === 0);

        await pm1.set([box1, box2], "box1 -> box2");
        ensure((await pm1.get([box1, box2])) === "box1 -> box2");
        ensure((await pm1.size()) === 1);

        await pm1.delete([box1, box2]);
        ensure((await pm1.size()) === 0);
        ensure(!(await pm1.get([box1, box2])));

        await pm1.set([box2, box3], "box2 -> box3");
        await pm1.set([box1, box3], "box1 -> box3");
        ensure((await pm1.size()) === 2);

        await pm1.set([box1, box2], "box1 -> box2");
        ensure((await pm1.get([box1, box2])) === "box1 -> box2");
    }
});

it("asOf and items work as intended", async function () {
    for (const store of [
        new IndexedDbStore("PM.test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const pm1 = await PairMap.create(instance);
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const box3 = await Box.create(instance);

        await pm1.set([box1, box2], "box1 -> box2");
        await sleep(10);
        const time0 = Date.now() * 1000;
        await sleep(10);
        await pm1.set([box2, box3], "box2 -> box3");
        await pm1.set([box1, box3], "box1 -> box3");

        ensure((await pm1.size()) === 3);
        ensure((await pm1.size(time0)) === 1);
        ensure(await pm1.has([box1, box2], time0));
        ensure(!(await pm1.has([box1, box3], time0)));
        ensure(await pm1.get([box1, box2], time0));
        ensure(!(await pm1.get([box1, box3], time0)));
    }
});
