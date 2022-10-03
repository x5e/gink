import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { Schema } from "../library-implementation/Schema";

test('set and get Basic data in root schema', async function() {
    // set up the objects
    const instance = new GinkInstance();
    const rootSchema = instance.root;

    // set a value
    await rootSchema.set("a key", "a value");

    // check that the desired result exists in the database
    const result = await rootSchema.get("a key");
    ensure(result == "a value");
});

test('set multiple key/value pairs in one change-set', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const rootSchema = instance.root;

    // make multiple changes in a change set
    const changeSet = new ChangeSet();
    await rootSchema.set("cheese", "fries", changeSet);
    await rootSchema.set("foo", "bar", changeSet);
    changeSet.comment = "Hear me roar!";
    await instance.addChangeSet(changeSet);

    // verify the result
    const result = await rootSchema.get("cheese");
    ensure(result == "fries", `result is ${result}`);
    const result2 = await rootSchema.get("foo");
    ensure(result2 == "bar", `result2 is ${result2}`);
});


test('use a sub-schema', async function() {
    const instance = new GinkInstance(new IndexedDbStore('test3', true));

    // set things up
    const newSchema = await instance.createSchema();
    await newSchema.set("xyz", "123");
    await instance.root.set("abc", newSchema);

    const anotherProxy = await instance.root.get("abc");
    if (!(anotherProxy instanceof Schema)) throw new Error("not a schema?");
    ensure("123" == await anotherProxy.get("xyz"))
});