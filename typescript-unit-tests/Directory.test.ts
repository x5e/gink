import { sleep } from "./test_utils";
import { GinkInstance, ChangeSet, IndexedDbStore, Directory } from "../typescript-impl";
import { ensure } from "../typescript-impl/utils"

test('set and get Basic data', async function() {
    // set up the objects
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const schema = await instance.createDirectory();

    // set a value
    await schema.set("a key", "a value");

    // check that the desired result exists in the database
    const result = await schema.get("a key");
    ensure(result == "a value");
});

test('set multiple key/value pairs in one change-set', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const schema = await instance.createDirectory();

    // make multiple changes in a change set
    const changeSet = new ChangeSet();
    await schema.set("cheese", "fries", changeSet);
    await schema.set("foo", "bar", changeSet);
    changeSet.comment = "Hear me roar!";
    await instance.addChangeSet(changeSet);

    // verify the result
    const result = await schema.get("cheese");
    ensure(result == "fries", `result is ${result}`);
    const result2 = await schema.get("foo");
    ensure(result2 == "bar", `result2 is ${result2}`);
});


test('use a sub-schema', async function() {
    const instance = new GinkInstance(new IndexedDbStore('test3', true));
    const schema = await instance.createDirectory();

    // set things up
    const newSchema = await instance.createDirectory();
    await newSchema.set("xyz", "123");
    await schema.set("abc", newSchema);

    const anotherProxy = await schema.get("abc");
    if (!(anotherProxy instanceof Directory)) throw new Error("not a schema?");
    ensure("123" == await anotherProxy.get("xyz"));
});

test('convert to standard Map', async function() {
    const instance = new GinkInstance(new IndexedDbStore('convert', true));
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

})

test('Directory.toJSON', async function () {
    const instance = new GinkInstance(new IndexedDbStore('toJSON', true));
    const directory = await instance.createDirectory();

    await directory.set("foo", "bar");
    await directory.set("bar", 3);
    await directory.set("zoom", null);
    const other = await instance.createDirectory();
    await other.set("xxx", "yyy");
    await directory.set("blue", other);
    const asJSON = await directory.toJson();
    ensure(asJSON == `{"bar":3,"blue":{"xxx":"yyy"},"foo":"bar","zoom":null}`, asJSON);
});

test('Directory.asOf', async function () {
    const instance = new GinkInstance(new IndexedDbStore('Directory.asOf', true));
    const directory = await instance.createDirectory();

    const time0 = Date.now() * 1000;
    await sleep(10);
    await directory.set('A', 'B');
    await sleep(10);
    const time1 = Date.now() * 1000;
    await sleep(10);
    await directory.set('cheese', 4);
    await sleep(10);
    const time2 = Date.now() * 1000;

    const asJsonNow = await directory.toJson();
    ensure(asJsonNow==`{"A":"B","cheese":4}`);
    ensure((await directory.get('cheese')) === 4);

    const asJson2 = await directory.toJson(false, time2);
    ensure(asJson2==`{"A":"B","cheese":4}`);
    ensure((await directory.get('cheese', time2)) === 4);

    const asJson1 = await directory.toJson(false, time1);
    ensure(asJson1==`{"A":"B"}`);
    ensure((await directory.get('cheese', time1)) === undefined);

    const asMap0 = await directory.toMap(time0);
    ensure(asMap0.size == 0);

    const asJsonBack = await directory.toJson(false, -1);
    ensure(asJsonBack==`{"A":"B"}`);
    ensure((await directory.get('cheese', -1)) === undefined);
    ensure((await directory.get('A', -1)) === 'B');
})