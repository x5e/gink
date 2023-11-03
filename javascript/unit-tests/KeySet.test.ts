import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, Value } from "../implementation";
import { ensure, matches } from "../implementation/utils"
import { KeySet } from "../implementation";

it('add and has basic data', async function () {
    // set up the objects
    const store = new IndexedDbStore('ks-test1', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    // add a value
    await ks.add("key1");

    // check that the result exists in the database
    ensure(await ks.has("key1"));

    const myKey = new Uint8Array(3);
    myKey[0] = 94;
    myKey[2] = 255;

    await ks.add(myKey);
    ensure(await ks.has(myKey));
});

it('delete, and size work as intended', async function () {
    const store = new IndexedDbStore('ks-test2', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    await ks.add("key1");
    ensure(await ks.has("key1"));
    ensure(await ks.size() === 1);

    await ks.delete("key1");
    ensure(!await ks.has("key1"));
    ensure(await ks.size() === 0);

    await ks.add("key1");
    await ks.add("key2");
    ensure(await ks.size() === 2);

    await ks.delete("key2");
    ensure(!await ks.has("key2"));
});

it('entries works as intended', async function () {
    const instance = new GinkInstance(new IndexedDbStore('ks-test3', true));
    const ks: KeySet = await instance.createKeySet();
    await ks.update(["key1", "key2", "key3"]);
    const buffer = <KeyType[]>[];

    for await (const [key, val] of ks.entries()) {
        await ks.delete(key);
        buffer.push(<KeyType>key);
    }
    ensure(matches(buffer, ["key1", "key2", "key3"]));
});

it('add multiple keys within a bundler', async function () {
    const store = new IndexedDbStore('ks-test4', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    // make multiple changes in a change set
    const bundler = new Bundler();
    await ks.add("key1", bundler);
    await ks.add("key2", bundler);
    bundler.comment = "My first bundle!";
    await instance.addBundler(bundler);

    // verify the result
    ensure(await ks.has("key1"));
    ensure(await ks.has("key2"));
    ensure(!await ks.has("key3"));
});

it('KeySet.toJson', async function () {
    const instance = new GinkInstance(new IndexedDbStore('ks-test6', true));
    const ks = await instance.createKeySet();

    await ks.add("key1");
    await ks.update(["key2", "key3"]);

    const asJSON = await ks.toJson();
    ensure(asJSON == `["key1","key2","key3"]`, asJSON);
});

it('KeySet.asOf', async function () {
    const instance = new GinkInstance(new IndexedDbStore('ks-test7', true));
    const ks = await instance.createKeySet();

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
    ensure(!await ks.has("key2", time1));

    // testing asOf for toJson
    ensure(await ks.toJson(false, time1) == `["key1"]`);
    ensure(await ks.toJson(false, time2) == `["key1","key2"]`);

    // testing asOf for size
    ensure(await ks.size(time0) == 0);
    ensure(await ks.size(time1) == 1);
    ensure(await ks.size(time2) == 2);

    // testing asOf toSet
    const values = await ks.toSet(time0);
    const values1 = await ks.toSet(time1);

    ensure(!values.size);
    ensure(!values.has("key2"));
    ensure(values1.size == 1);
    ensure(values1.has("key1"));
});

it('KeySet.clear', async function () {
    const instance = new GinkInstance(new IndexedDbStore('ks-test8', true));
    const ks = await instance.createKeySet();
    await ks.update(["key1", "key2"]);
    const clearMuid = await ks.clear();
    ensure(await ks.update(["key3", "key4"]) instanceof Bundler);
    const asSet = await ks.toSet();
    ensure(asSet.has("key4") && !asSet.has("key1"), "did not clear")
    const asSetBeforeClear = await ks.toSet(clearMuid.timestamp);
    if (asSetBeforeClear.has("key4") || !asSetBeforeClear.has("key1")) {
        console.log(asSetBeforeClear);
        throw new Error("busted");
    }
});

it('KeySet.clear(purge)', async function () {
    const instance = new GinkInstance(new IndexedDbStore('ks-test9', true));
    const ks = await instance.createKeySet();
    await ks.add('key1');
    await sleep(10);
    const middle = Date.now() * 1000;
    await sleep(10);
    await ks.add('key2');
    ensure(await ks.has("key2"));
    await ks.clear(true);
    const found = await instance.store.getKeyedEntries(ks.address, middle);
    ensure(!found.size);

});
