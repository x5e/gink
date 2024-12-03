import { Database, IndexedDbStore, MemoryStore, Box } from "../implementation";
import {
    ensure,
    generateTimestamp,
    muidToString,
    muidTupleToMuid,
} from "../implementation/utils";

it("include and exclude work as intended", async function () {
    for (const store of [
        new IndexedDbStore("Group.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const group1 = await instance.createGroup();

        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        await group1.include(box1);
        ensure(await group1.isIncluded(box1), `Doesn't contain box1`);
        ensure(await group1.isIncluded(box1.address));

        await group1.exclude(box1);
        ensure(
            !(await group1.isIncluded(box1)),
            `Still contains box1 after exclude`
        );

        // Testing a container can be excluded before it was included.
        await group1.exclude(box2);
        let found = false;
        const box2MuidStr = muidToString(box2.address);
        for (const entry of await store.getAllEntries()) {
            if (
                Array.isArray(entry.storageKey) &&
                entry.storageKey.length === 3
            ) {
                if (
                    box2MuidStr ===
                    muidToString(muidTupleToMuid(entry.storageKey))
                ) {
                    found = true;
                }
            }
        }
        ensure(found);
    }
});

it("contains, toArray, and getMembers work properly", async function () {
    for (const store of [
        new IndexedDbStore("Group.test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const group1 = await instance.createGroup();

        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const box3 = await Box.create(instance);
        await group1.include(box1);
        await group1.include(box2);
        ensure(await group1.isIncluded(box1));
        ensure(!(await group1.isIncluded(box3)));

        ensure((await group1.size()) === 2);

        ensure((await group1.includedAsArray()).length === 2);
        ensure((await group1.includedAsArray())[0].behavior);

        for await (const member of group1.getMembers()) {
            ensure(member.address && member.behavior && member.database);
        }
    }
});

it("Group.reset", async function () {
    for (const store of [
        new IndexedDbStore("Group.test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const box1 = await Box.create(instance);
        const box2 = await Box.create(instance);
        const group = await instance.createGroup();
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(group, "foo");
        await prop2.set(group, "bar");
        await group.include(box1);
        const afterOne = generateTimestamp();
        await group.include(box2);
        await prop1.set(group, "foo2");
        await prop2.set(group, "bar2");
        ensure(await group.isIncluded(box2));
        await group.reset({ toTime: afterOne });
        ensure((await prop1.get(group)) === "foo");
        ensure((await prop2.get(group)) === "bar");
        ensure(!(await group.isIncluded(box2)));
        ensure(await group.isIncluded(box1));
        await group.reset();
        ensure((await group.size()) === 0);
        ensure((await prop1.get(group)) === undefined);
        ensure((await prop2.get(group)) === undefined);
        await group.include(box1);
        await group.include(box2);
        const beforeExclude = generateTimestamp();
        await group.exclude(box1);
        await group.reset({ toTime: beforeExclude, skipProperties: true });
        ensure(await group.isIncluded(box1));
        ensure(await group.isIncluded(box2));
        ensure((await prop1.get(group)) === undefined);
        ensure((await prop2.get(group)) === undefined);
    }
});
