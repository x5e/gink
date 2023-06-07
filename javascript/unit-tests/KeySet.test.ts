
import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, KeySet } from "../implementation";
import { ensure } from "../implementation/utils"

test('set and get Basic data', async function() {
    // set up the objects
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const ks = await instance.createKeySet();

    // add a value
    await ks.add("key1");

    // check that the result exists in the database
    ensure(ks.has("key1"));
});