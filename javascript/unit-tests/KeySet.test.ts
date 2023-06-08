
import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, KeySet } from "../implementation";
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

    console.log(await ks.toJson())

});