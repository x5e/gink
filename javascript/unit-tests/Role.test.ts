import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, muidToString, muidTupleToMuid } from "../implementation/utils";

it('include and exclude work as intended', async function () {
    for (const store of [new IndexedDbStore('Group.test1', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const group1 = await instance.createGroup();

        const box1 = await instance.createBox();
        const box2 = await instance.createBox();
        await group1.include(box1);
        ensure(await group1.isIncluded(box1), `Doesn't contain box1`);
        ensure(await group1.isIncluded(box1.address));

        await group1.exclude(box1);
        ensure(!(await group1.isIncluded(box1)), `Still contains box1 after exclude`);

        // Testing a container can be excluded before it was included.
        await group1.exclude(box2);
        let found = false;
        const box2MuidStr = muidToString(box2.address);
        for (const entry of await store.getAllEntries()) {
            if (Array.isArray(entry.storageKey) && entry.storageKey.length == 3) {
                if (box2MuidStr == muidToString(muidTupleToMuid(entry.storageKey))) {
                    found = true;
                }
            }
        }
        ensure(found);
    }
});

it('contains, toArray, and getMembers work properly', async function () {
    for (const store of [new IndexedDbStore('Group.test2', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const group1 = await instance.createGroup();

        const box1 = await instance.createBox();
        const box2 = await instance.createBox();
        const box3 = await instance.createBox();
        await group1.include(box1);
        await group1.include(box2);
        ensure(await group1.isIncluded(box1));
        ensure(!(await group1.isIncluded(box3)));

        ensure((await group1.includedAsArray()).length == 2);
        ensure((await group1.includedAsArray())[0].behavior);

        for await (const member of group1.getMembers()) {
            ensure(member.address && member.behavior && member.database);
        }
    }
});
