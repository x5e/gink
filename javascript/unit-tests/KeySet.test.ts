import { sleep } from "./test_utils";
import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, generateTimestamp, matches } from "../implementation/utils";
import { KeySet } from "../implementation";

it("add and has basic data", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("ks-test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);

        // add a value
        await ks.add("key1");

        // check that the result exists in the database
        ensure(await ks.has("key1"));

        const myKey = new Uint8Array(3);
        myKey[0] = 94;
        myKey[2] = 255;

        await ks.add(myKey);
        ensure(await ks.has(myKey));
    }
});

it("delete, and size work as intended", async function () {
    for (const store of [
        new IndexedDbStore("ks-test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);

        await ks.add("key1");
        ensure(await ks.has("key1"));
        ensure((await ks.size()) === 1);

        await ks.delete("key1");
        ensure(!(await ks.has("key1")));
        ensure((await ks.size()) === 0);

        await ks.add("key1");
        await ks.add("key2");
        ensure((await ks.size()) === 2);

        await ks.delete("key2");
        ensure(!(await ks.has("key2")));
    }
});

it("entries works as intended", async function () {
    for (const store of [
        new IndexedDbStore("ks-test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks: KeySet = await KeySet.create(instance);
        await ks.update(["key1", "key2", "key3"]);
        const buffer = <KeyType[]>[];

        for await (const [key, val] of ks.entries()) {
            await ks.delete(key);
            buffer.push(<KeyType>key);
        }
        ensure(matches(buffer, ["key1", "key2", "key3"]));
    }
});

it("add multiple keys within a bundler", async function () {
    for (const store of [
        new IndexedDbStore("ks-test4", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);

        // make multiple changes in a change set
        const bundler = await instance.startBundle();
        await ks.add("key1", { bundler });
        await ks.add("key2", { bundler });
        await bundler.commit("My first bundle!");

        // verify the result
        ensure(await ks.has("key1"));
        ensure(await ks.has("key2"));
        ensure(!(await ks.has("key3")));
    }
});

it("KeySet.toJson", async function () {
    for (const store of [
        new IndexedDbStore("ks-test6", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);

        await ks.add("key1");
        await ks.update(["key2", "key3"]);

        const asJSON = await ks.toJson();
        ensure(asJSON === `["key1","key2","key3"]`, asJSON);
    }
});

it("KeySet.asOf", async function () {
    for (const store of [
        new IndexedDbStore("ks-test7", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);

        const time0 = Date.now() * 1000;
        await sleep(10);
        await ks.add("key1");
        await sleep(10);
        const time1 = Date.now() * 1000;
        await sleep(10);
        await ks.add("key2");
        await sleep(10);
        const time2 = Date.now() * 1000;

        // testing asOf for has
        ensure(await ks.has("key1", time1));
        ensure(await ks.has("key1", -1));
        ensure(await ks.has("key1", time2));
        ensure(!(await ks.has("key2", time1)));

        // testing asOf for toJson
        ensure((await ks.toJson(false, time1)) === `["key1"]`);
        ensure((await ks.toJson(false, time2)) === `["key1","key2"]`);

        // testing asOf for size
        ensure((await ks.size(time0)) === 0);
        ensure((await ks.size(time1)) === 1);
        ensure((await ks.size(time2)) === 2);

        // testing asOf toSet
        const values = await ks.toSet(time0);
        const values1 = await ks.toSet(time1);

        ensure(!values.size);
        ensure(!values.has("key2"));
        ensure(values1.size === 1);
        ensure(values1.has("key1"));
    }
});

it("KeySet.clear", async function () {
    for (const store of [
        new IndexedDbStore("ks-test8", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);
        await ks.update(["key1", "key2"]);
        const clearMuid = await ks.clear();
        await ks.update(["key3", "key4"]);
        const asSet = await ks.toSet();
        ensure(asSet.has("key4") && !asSet.has("key1"), "did not clear");
        const asSetBeforeClear = await ks.toSet(clearMuid.timestamp);
        if (asSetBeforeClear.has("key4") || !asSetBeforeClear.has("key1")) {
            console.log(asSetBeforeClear);
            throw new Error("busted");
        }
    }
});

it("KeySet.clear(purge)", async function () {
    for (const store of [
        new IndexedDbStore("ks-test9", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);
        await ks.add("key1");
        await sleep(10);
        const middle = Date.now() * 1000;
        await sleep(10);
        await ks.add("key2");
        ensure(await ks.has("key2"));
        await ks.clear(true);
        const found = await instance.store.getKeyedEntries(ks.address, middle);
        ensure(!found.size);
    }
});

it("KeySet.reset", async function () {
    for (const store of [
        new IndexedDbStore("ks-test10", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const ks = await KeySet.create(instance);
        await ks.add("key1");

        const afterOne = generateTimestamp();
        await ks.add("key2");
        ensure(await ks.has("key2"));
        await ks.reset(afterOne);
        ensure(!(await ks.has("key2")));
        ensure(await ks.has("key1"));
        await ks.reset();
        ensure(!(await ks.has("key1")));
        ensure((await ks.size()) === 0);
        await ks.add("key3");
        const after3 = generateTimestamp();
        await ks.add("key4");
        ensure((await ks.size()) === 2);
        await ks.delete("key3");
        ensure((await ks.size()) === 1);
        await ks.reset(after3);
        ensure((await ks.size()) === 1);
        ensure(await ks.has("key3"));
        ensure(!(await ks.has("key4")));
    }
});
