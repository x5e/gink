import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { Directory } from "../library-implementation/Directory";

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
    console.log(JSON.stringify(Array.from(asMap.entries())));
    ensure(asMap.size == 2);
    ensure(!asMap.has("foo"));
    ensure(asMap.get("bar") == "iron");
    ensure(asMap.get("cheese") == "fries");

})
