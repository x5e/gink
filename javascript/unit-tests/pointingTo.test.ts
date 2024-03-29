import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure } from "../implementation/utils";

it('pointingTo', async function () {
    for (const store of [new IndexedDbStore('pointingTo', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;

        const target = await instance.createBox();

        const directory = await instance.createDirectory();
        await directory.set("foo", target);

        const list = await instance.createSequence();
        await list.push(target);

        const box = await instance.createBox();
        await box.set(target);

        const notPointing = await instance.createDirectory();

        const refs = await store.getBackRefs(target.address);

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
    }
});
