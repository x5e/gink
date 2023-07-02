import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure, muidToString, muidTupleToMuid, stringToMuid } from "../implementation/utils";
import { sleep } from "./test_utils";

test('set, get, delete, and size work as intended', async function() {
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
});
