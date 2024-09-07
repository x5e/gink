import { sleep } from "./test_utils";
import {
    Database,
    Bundler,
    IndexedDbStore,
    Directory,
    MemoryStore,
} from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("set and get basic data", async function () {
    for (const store of [
        new IndexedDbStore("Directory.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const schema = await instance.createDirectory();

        // set a value
        await schema.set("a key", "a value");

        const myKey = new Uint8Array(3);
        myKey[0] = 94;
        myKey[2] = 255;

        await schema.set(myKey, "another value");
        const another_result = await schema.get(myKey);

        if (another_result !== "another value") {
            const allEntries = await store.getAllEntries();
            throw new Error("didnt' get what i expected");
        }

        // check that the desired result exists in the database
        const result = await schema.get("a key");
        ensure(result === "a value");

        await store.close();
    }
});

it("set and get data in two directories", async function () {
    for (const store of [
        new IndexedDbStore("two.directories", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const dir1 = await instance.createDirectory();
        const dir2 = await instance.createDirectory();

        // set a value
        await dir1.set("key-a", "value1");
        await dir2.set("key-a", "value2");
        await dir1.set("key-b", "value3");

        // check that the desired result exists in the database;
        const result1 = await dir1.get("key-a");
        ensure(result1 === "value1");

        const result2 = await dir2.get("key-a");
        ensure(result2 === "value2", String(result2));

        const result3 = await dir1.size();
        ensure(result3 === 2, String(result3));

        const result4 = await dir2.has("key-b");
        ensure(!result4);

        await store.close();
    }
});

it("set multiple key/value pairs in one change-set", async function () {
    for (const store of [
        new IndexedDbStore("Directory.test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const schema = await instance.createDirectory();

        // make multiple changes in a change set
        const bundler = new Bundler();
        await schema.set("cheese", "fries", bundler);
        await schema.set("foo", "bar", bundler);
        bundler.comment = "Hear me roar!";
        await instance.addBundler(bundler);

        // verify the result
        const result = await schema.get("cheese");
        ensure(result === "fries", `result is ${result}`);
        const result2 = await schema.get("foo");
        ensure(result2 === "bar", `result2 is ${result2}`);
        await store.close();
    }
});

it("use a sub-schema", async function () {
    for (const store of [
        new IndexedDbStore("Directory.test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const schema = await instance.createDirectory();

        // set things up
        const newSchema = await instance.createDirectory();
        await newSchema.set("xyz", "123");
        await schema.set("abc", newSchema);

        const anotherProxy = await schema.get("abc");
        if (!(anotherProxy instanceof Directory))
            throw new Error("not a schema?");
        ensure("123" === (await anotherProxy.get("xyz")));
        await store.close();
    }
});

it("purge one directory leaving other untouched", async function () {
    for (const store of [
        new IndexedDbStore("purge etc.", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const d1 = await instance.createDirectory();
        const d2 = await instance.createDirectory();

        await d1.set("foo", "bar");
        await d2.set("abc", "xyz");

        await d1.clear(true);

        ensure(0 === (await d1.size()));
        const size = await d2.size();
        ensure(0 !== size, "directory 2 has been purged!");
    }
});

it("convert to standard Map", async function () {
    for (const store of [
        new IndexedDbStore("Directory.convert", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const directory = await instance.createDirectory();

        await directory.set("foo", "bar");
        await directory.set("bar", "baz");
        await directory.delete("foo");
        await directory.set("bar", "iron");
        await directory.set("cheese", "fries");

        const asMap = await directory.toMap();
        ensure(
            asMap.size === 2,
            `expected to be 2: ${asMap.size} ${JSON.stringify(asMap)}`
        );
        ensure(!asMap.has("foo"));
        ensure(asMap.get("bar") === "iron");
        ensure(asMap.get("cheese") === "fries");

        const another = await instance.createDirectory();
        await another.set(new Uint8Array([94, 10]), "foo");
        const anotherAsMap = await another.toMap();
        ensure(anotherAsMap.size === 1);
        const keys = Array.from(anotherAsMap.keys());
        ensure(keys[0] instanceof Uint8Array);
        ensure(keys[0][0] === 94 && keys[0][1] === 10);
    }
});

it("Directory.toJSON", async function () {
    for (const store of [
        new IndexedDbStore("Directory.toJSON", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const directory = await instance.createDirectory();

        await directory.set("foo", "bar");
        await directory.set("bar", 3);
        await directory.set("zoom", null);
        const other = await instance.createDirectory();
        await other.set("xxx", "yyy");
        await directory.set("blue", other);
        await directory.set(new Uint8Array([94, 10]), "^\n");
        const asJson = await directory.toJson();
        // MemoryStore returns entries in the order they were set,
        // so comparing an exact string won't work
        const fromJson = JSON.parse(asJson);
        ensure(fromJson.bar === 3 && fromJson.foo === "bar", fromJson);
        ensure(fromJson.blue.xxx === "yyy" && fromJson.zoom === null, fromJson);
        ensure(fromJson["94,10"] === "^\n", asJson);

        // Test number keys
        await directory.clear();
        await directory.set(1, "foo");
        const json = await directory.toJson();
        ensure(json === '{"1":"foo"}', json);
        await directory.set(2, "bar");
        await directory.set(3, "baz");
        await directory.set(4, "aaa");
        await directory.set(123103, "woo");
        const parsed = JSON.parse(await directory.toJson());
        ensure(
            parsed["1"] === "foo" &&
                parsed["2"] === "bar" &&
                parsed["3"] === "baz" &&
                parsed["4"] === "aaa" &&
                parsed["123103"] === "woo",
            JSON.stringify(parsed)
        );

        await store.close();
    }
});

it("Directory.asOf", async function () {
    for (const store of [
        new IndexedDbStore("Directory.asOf", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const directory = await instance.createDirectory();

        const time0 = generateTimestamp();
        await sleep(10);
        await directory.set("A", "B");
        await sleep(10);
        const time1 = generateTimestamp();
        await sleep(10);
        await directory.set("cheese", 4);
        await sleep(10);
        const time2 = generateTimestamp();

        const asJsonNow = await directory.toJson();
        ensure(asJsonNow === `{"A":"B","cheese":4}`);
        ensure((await directory.get("cheese")) === 4);

        const asJson2 = await directory.toJson(false, time2);
        ensure(asJson2 === `{"A":"B","cheese":4}`);
        ensure((await directory.get("cheese", time2)) === 4);

        const asJson1 = await directory.toJson(false, time1);
        ensure(asJson1 === `{"A":"B"}`);
        ensure((await directory.get("cheese", time1)) === undefined);

        const asMap0 = await directory.toMap(time0);
        ensure(asMap0.size === 0);

        const asJsonBack = await directory.toJson(false, -1);
        ensure(asJsonBack === `{"A":"B"}`);
        ensure((await directory.get("cheese", -1)) === undefined);
        ensure((await directory.get("A", -1)) === "B");
        await store.close();
    }
});

it("Directory.purge", async function () {
    for (const store of [
        new IndexedDbStore("Directory.purge", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const directory = await instance.createDirectory();

        await directory.set("A", 99);
        await sleep(10);
        const middle = generateTimestamp();
        await sleep(10);
        await directory.set("B", false);

        ensure((await directory.has("A")) && (await directory.has("B")));
        await directory.clear(true);

        const found = await instance.store.getKeyedEntries(
            directory.address,
            middle
        );
        ensure(!found.size);
        ensure(!(await directory.size()));
        await store.close();
    }
});

it(
    "Directory.clear",
    async function () {
        for (const store of [
            new IndexedDbStore("Directory.clear", true),
            new MemoryStore(true),
        ]) {
            const instance = new Database(store);
            await instance.ready;
            const directory = await instance.createDirectory();
            await directory.set("A", 99);
            const clearMuid = await directory.clear();
            await directory.set("B", false);
            const asMap = await directory.toMap();
            ensure(asMap.has("B") && !asMap.has("A"), "did not clear");
            const asMapBeforeClear = await directory.toMap(clearMuid.timestamp);
            if (asMapBeforeClear.has("B") || !asMapBeforeClear.has("A")) {
                throw new Error("busted");
            }
            // Ensure getEntryByKey works the same way
            ensure(await directory.get("A", clearMuid.timestamp));
            ensure(!(await directory.get("B", clearMuid.timestamp)));
            await store.close();
        }
    },
    1000 * 1000 * 1000
);
