
import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore } from "../implementation";
import { ensure } from "../implementation/utils"

test('add and has basic data', async function() {
    // set up the objects
    const store = new IndexedDbStore('test1', true);
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

test('delete and size work as intended', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    await ks.add("key1");
    ensure(await ks.has("key1"));
    ensure(await ks.size() === 1);

    await ks.delete("key1");
    ensure(await ks.size() === 0);

    await ks.add("key1");
    await ks.add("key2");
    ensure(await ks.size() === 2);
});

test('update and entries work as intended', async function() {
    const store = new IndexedDbStore('test3', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    await ks.update(['key1', 'key2', 'key3']);
    
    const myMap = await ks.entries();
    ensure(myMap.has("key1"));
    ensure(myMap.has("key3"));

    // update using a set rather than an array
    await ks.update(new Set(["key4", "key5", "key6"]));
    await ks.delete("key5");
    const myMap2 = await ks.entries();
    ensure(myMap2.has("key6"));
    ensure(!myMap2.has("key5"));
});

test('tests keys and values both return the correct set', async function() {
    const store = new IndexedDbStore('test4', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    await ks.update(["key1", "key2", "key3"]);

    const values = await ks.values();
    const keys = await ks.keys();
    
    ensure(values.size === 3);
    ensure(values.has("key1"));
    ensure(values.has("key3"));
    
    ensure(keys.size === 3);
    ensure(keys.has("key1"));
    ensure(keys.has("key3"));
});

test('tests superset, union, intersection, symmetric difference, difference', async function() {
    const store = new IndexedDbStore('test5', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    await ks.update(["key1", "key2", "key3"]);

    // testing superset
    ensure(await ks.isSuperset(["key2", "key3"]));
    ensure(!await ks.isSuperset(["key2", "key4"]));

    // testing union
    const union = await ks.union(["key4", "key5", "key6"]);
    ensure(union.has("key2"));
    ensure(union.has("key5"));
    ensure(!union.has("key9"));

    // testing intersection
    const intersection = await ks.intersection(["key3", "key4", "key5"]);
    ensure(intersection.has("key3"));
    ensure(!intersection.has("key2"));
    ensure(!intersection.has("key4"));

    // testing symmetric difference
    const symDiff = await ks.symmetricDifference(["key3", "key4", "key5"]);
    ensure(!symDiff.has("key3"));
    ensure(symDiff.has("key2"));
    ensure(symDiff.has("key4"));

    // testing difference
    const difference = await ks.difference(["key3", "key4", "key5"]);
    ensure(difference.has("key1"));
    ensure(difference.has("key2"));
    ensure(!difference.has("key3"));
});

test('KeySet.toJson', async function() {
    const instance = new GinkInstance(new IndexedDbStore('test6', true));
    const ks = await instance.createKeySet();

    await ks.add("key1");
    await ks.update(["key2", "key3"]);
    
    const asJSON = await ks.toJson();
    ensure(asJSON == `{"key1","key2","key3"}`, asJSON);
});

test('KeySet.asOf', async function() {
    const instance = new GinkInstance(new IndexedDbStore('test7', true));
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
    ensure(await ks.toJson(false, time1)==`{"key1"}`);
    ensure(await ks.toJson(false, time2)==`{"key1","key2"}`);

    // testing asOf for size
    ensure(await ks.size(time0)==0);
    ensure(await ks.size(time1)==1);
    ensure(await ks.size(time2)==2);

    // testing asOf for entries, values, and keys
    const values = await ks.values(time0);
    const keys = await ks.keys(time1);
    const entries = await ks.entries(time2);

    ensure(!values.size);
    ensure(keys.size==1);
    ensure(entries.size==2);
    ensure(keys.has("key1") && entries.has("key1"));
    ensure(!keys.has("key2"));
});

test('KeySet.clear', async function() {
    const instance = new GinkInstance(new IndexedDbStore('test8', true));
    const ks = await instance.createKeySet();
    await ks.update(["key1", "key2"]);
    const clearMuid = await ks.clear();
    await ks.update(["key3", "key4"]);
    const asMap = await ks.entries();
    ensure(asMap.has("key4") && !asMap.has("key1"), "did not clear")
    const asMapBeforeClear = await ks.entries(clearMuid.timestamp);
    if (asMapBeforeClear.has("key4") || !asMapBeforeClear.has("key1")) {
        console.log(asMapBeforeClear);
        throw new Error("busted");
    }
});

test('KeySet.purge', async function () {
    const instance = new GinkInstance(new IndexedDbStore('test9', true));
    const ks = await instance.createKeySet();
    await ks.add('key1');
    await ks.add('key2');
    let size = await ks.size();
    ensure(size == 2);
    await ks.clear(true);
    size = await ks.size();
    ensure(size == 0);
});

test('add multiple keys within a bundler', async function() {
    const store = new IndexedDbStore('test10', true);
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
