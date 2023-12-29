import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, Directory, MemoryStore } from "../implementation";
import { ensure } from "../implementation/utils";

it('set and get Basic data', async function () {
    for (const store of [new IndexedDbStore('Directory.test1', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const schema = await instance.createDirectory();

        // set a value
        await schema.set("a key", "a value");

        // check that the desired result exists in the database
        const result = await schema.get("a key");
        ensure(result == "a value");

        const myKey = new Uint8Array(3);
        myKey[0] = 94;
        myKey[2] = 255;

        await schema.set(myKey, "another value");
        const another_result = await schema.get(myKey);

        ensure(another_result == "another value");
        await store.close();
    }
});

it('set multiple key/value pairs in one change-set', async function () {
    for (const store of [new IndexedDbStore('Directory.test2', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const schema = await instance.createDirectory();

        // make multiple changes in a change set
        const bundler = new Bundler();
        await schema.set("cheese", "fries", bundler);
        await schema.set("foo", "bar", bundler);
        bundler.comment = "Hear me roar!";
        await instance.addBundler(bundler);

        // verify the result
        const result = await schema.get("cheese");
        ensure(result == "fries", `result is ${result}`);
        const result2 = await schema.get("foo");
        ensure(result2 == "bar", `result2 is ${result2}`);
        await store.close();
    }
});


it('use a sub-schema', async function () {
    for (const store of [new IndexedDbStore('Directory.test3', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const schema = await instance.createDirectory();

        // set things up
        const newSchema = await instance.createDirectory();
        await newSchema.set("xyz", "123");
        await schema.set("abc", newSchema);

        const anotherProxy = await schema.get("abc");
        if (!(anotherProxy instanceof Directory)) throw new Error("not a schema?");
        ensure("123" == await anotherProxy.get("xyz"));
        await store.close();
    }
});

it('convert to standard Map', async function () {
    for (const store of [new IndexedDbStore('Directory.convert', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const directory = await instance.createDirectory();

        await directory.set("foo", "bar");
        await directory.set("bar", "baz");
        await directory.delete("foo");
        await directory.set("bar", "iron");
        await directory.set("cheese", "fries");

        const asMap = await directory.toMap();
        ensure(asMap.size == 2);
        ensure(!asMap.has("foo"));
        ensure(asMap.get("bar") == "iron");
        ensure(asMap.get("cheese") == "fries");
        await store.close();
    }
});

it('Directory.toJSON', async function () {
    for (const store of [new IndexedDbStore('Directory.toJSON', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const directory = await instance.createDirectory();

        await directory.set("foo", "bar");
        await directory.set("bar", 3);
        await directory.set("zoom", null);
        const other = await instance.createDirectory();
        await other.set("xxx", "yyy");
        await directory.set("blue", other);
        const asJSON = await directory.toJson();
        // MemoryStore returns entries in the order they were set,
        // so comparing an exact string won't work
        const fromJSON = JSON.parse(asJSON);
        ensure(fromJSON.bar == 3 && fromJSON.foo == "bar", fromJSON);
        ensure(fromJSON.blue.xxx == "yyy" && fromJSON.zoom == null, fromJSON);
        await store.close();
    }
});

it('Directory.asOf', async function () {
    for (const store of [new IndexedDbStore('Directory.asOf', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const directory = await instance.createDirectory();

        const time0 = instance.getNow();
        await sleep(10);
        await directory.set('A', 'B');
        await sleep(10);
        const time1 = instance.getNow();
        await sleep(10);
        await directory.set('cheese', 4);
        await sleep(10);
        const time2 = instance.getNow();

        const asJsonNow = await directory.toJson();
        ensure(asJsonNow == `{"A":"B","cheese":4}`);
        ensure((await directory.get('cheese')) === 4);

        const asJson2 = await directory.toJson(false, time2);
        ensure(asJson2 == `{"A":"B","cheese":4}`);
        ensure((await directory.get('cheese', time2)) === 4);

        const asJson1 = await directory.toJson(false, time1);
        ensure(asJson1 == `{"A":"B"}`);
        ensure((await directory.get('cheese', time1)) === undefined);

        const asMap0 = await directory.toMap(time0);
        ensure(asMap0.size == 0);

        const asJsonBack = await directory.toJson(false, -1);
        ensure(asJsonBack == `{"A":"B"}`);
        ensure((await directory.get('cheese', -1)) === undefined);
        ensure((await directory.get('A', -1)) === 'B');
        await store.close();
    }
});

it('Directory.purge', async function () {
    for (const store of [new IndexedDbStore('Directory.purge', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const directory = await instance.createDirectory();

        await directory.set('A', 99);
        await sleep(10);
        const middle = instance.getNow();
        await sleep(10);
        await directory.set('B', false);

        ensure(await directory.has("A") && await directory.has("B"));
        await directory.clear(true);

        const found = await instance.store.getKeyedEntries(directory.address, middle);
        ensure(!found.size);
        ensure(!await directory.size());
        await store.close();
    }
});

it('Directory.clear', async function () {
    for (const store of [new IndexedDbStore('Directory.clear', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const directory = await instance.createDirectory();
        await directory.set('A', 99);
        const clearMuid = await directory.clear();
        await directory.set('B', false);
        const asMap = await directory.toMap();
        ensure(asMap.has("B") && !asMap.has("A"), "did not clear");
        const asMapBeforeClear = await directory.toMap(clearMuid.timestamp);
        if (asMapBeforeClear.has("B") || !asMapBeforeClear.has("A")) {
            throw new Error("busted");
        }
        await store.close();
    }
});
