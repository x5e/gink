import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure } from "../implementation/utils"

test('pointingTo', async function () {
    const indexedDBStore = new IndexedDbStore('pointingTo', true);
    const instance = new GinkInstance(indexedDBStore);

    const target = await instance.createBox();

    const directory = await instance.createDirectory();
    await directory.set("foo", target);

    const list = await instance.createList();
    await list.push(target);

    const box = await instance.createBox();
    await box.set(target);

    const notPointing = await instance.createDirectory();

    const refs = await indexedDBStore.getBackRefs(target.address);

    const containers = refs.map((entry) => `Container(${entry.containerId.toString()})`);

    ensure(containers.includes(directory.toString()));
    ensure(containers.includes(list.toString()));
    ensure(containers.includes(box.toString()));
    ensure(!containers.includes(notPointing.toString()));

    const found: string[] = [];
    for await (const pair of target.getBackRefs()) {
        found.push(pair[1].toString());
    }
    ensure(found.length == 3);
    ensure(found.includes(list.toString()));
    ensure(found.includes(directory.toString()));
    ensure(found.includes(box.toString()));
});
