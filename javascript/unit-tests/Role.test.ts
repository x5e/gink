import { GinkInstance, IndexedDbStore } from "../implementation";
import { ensure, muidToString, muidTupleToMuid } from "../implementation/utils";

test('include and exclude work as intended', async function() {
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const role1 = await instance.createRole();

    ensure(await role1.size() == 0, `${await role1.size()}`);

    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    await role1.include(box1);
    ensure(await role1.size() == 1, `Include test, unexpected size: ${await role1.size()}`);
    ensure(await role1.contains(box1));
    ensure(await role1.contains(box1.address));

    await role1.exclude(box1);
    ensure(await role1.contains(box1));
    ensure(await role1.size() == 0, `Exclude test, unexpected size: ${await role1.size()}`);

    // Testing a container can be excluded before it was included.
    await role1.exclude(box2);
    let found = false;
    const box2MuidStr = muidToString(box2.address);
    for (const entry of await store.getAllEntries()) {
        if(typeof(entry.effectiveKey)=="object" && !(entry.effectiveKey instanceof Uint8Array) &&
        !(entry.effectiveKey instanceof Array)) {
            if (box2MuidStr == muidToString(muidTupleToMuid(entry.effectiveKey))) {
                found = true;
            }
        }
    }
    ensure(found);
});

test('contains, toSet, and get_member_ids work properly', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const role1 = await instance.createRole();

    const box1 = await instance.createBox();
    const box2 = await instance.createBox();
    const box3 = await instance.createBox();
    await role1.include(box1);
    await role1.include(box2);
    ensure(await role1.contains(box1));
    ensure(!(await role1.contains(box3)));

    ensure((await role1.toSet()).size == 2);
});