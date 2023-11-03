import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure } from "../implementation/utils";
import { sleep } from "./test_utils";

it('set, get, delete, and size work as intended', async function () {
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const pm1 = await instance.createPairMap();
    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    const box3 = await instance.createBox();

    ensure(await pm1.size() == 0);

    await pm1.set([box1, box2], "box1 -> box2");
    ensure(await pm1.get([box1, box2]) == "box1 -> box2");
    ensure(await pm1.size() == 1);

    await pm1.delete([box1, box2]);
    ensure(await pm1.size() == 0);
    ensure(!await pm1.get([box1, box2]));

    await pm1.set([box2, box3], "box2 -> box3");
    await pm1.set([box1, box3], "box1 -> box3");
    ensure(await pm1.size() == 2);

    await pm1.set([box1, box2.address], "box1 -> box2");
    ensure(await pm1.get([box1.address, box2]) == "box1 -> box2");
});

it('asOf and items work as intended', async function () {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const pm1 = await instance.createPairMap();
    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    const box3 = await instance.createBox();

    await pm1.set([box1, box2], "box1 -> box2");
    await sleep(10);
    const time0 = Date.now() * 1000;
    await sleep(10);
    await pm1.set([box2, box3], "box2 -> box3");
    await pm1.set([box1, box3], "box1 -> box3");

    ensure(await pm1.size() == 3);
    ensure(await pm1.size(time0) == 1);
    ensure(await pm1.has([box1, box2], time0));
    ensure(!await pm1.has([box1, box3], time0));
    ensure(await pm1.get([box1, box2], time0));
    ensure(!await pm1.get([box1, box3], time0));

    const items0 = await pm1.items(time0);
    ensure(items0.size == 1);
    ensure(items0.keys().next().value[0].timestamp == box1.address.timestamp);
    ensure(items0.keys().next().value[1].timestamp == box2.address.timestamp);
    ensure(items0.values().next().value == "box1 -> box2");
});
