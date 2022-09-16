import { assert } from "./utils";
import { Container } from "./Container";
import { GinkInstance } from "./GinkInstance";
import { ChangeSet } from "./ChangeSet";
import { IndexedDbStore } from "./IndexedDbStore";
import { ChangeSet as ChangeSetBuilder } from "change_set_pb";

test('set and get Basic data in root schema', async function() {
    // set up the objects
    const instance = new GinkInstance();
    const rootSchema = new Container(instance);  // should probably become instance.getRoot()

    // set a value
    await rootSchema.set("a key", "a value");

    // check that the desired result exists in the database
    const result = await rootSchema.get("a key");
    assert(result == "a value");
});

test('set multiple key/value pairs in one change-set', async function() {
    const store = new IndexedDbStore('test2', true);
    const instance = new GinkInstance(store);
    const rootSchema = new Container(instance);

    // make multiple changes in a change set
    const changeSet = new ChangeSet();
    await rootSchema.set("cheese", "fries", changeSet);
    await rootSchema.set("foo", "bar", changeSet);
    changeSet.comment = "Hear me roar!";
    await instance.addChangeSet(changeSet);

    const map = changeSet.changeSetBuilder.getChangesMap();
    const changeSetBuilder = ChangeSetBuilder.deserializeBinary(changeSet.serialized);
    console.log(changeSetBuilder.toObject());
    

    const allKeys = await store.getAllEntryKeys();
    console.log(JSON.stringify(allKeys));


    // verify the result
    const result = await rootSchema.get("cheese");
    assert(result == "fries", `result is ${result}`);
    const result2 = await rootSchema.get("foo");
    assert(result2 == "bar", `result2 is ${result2}`);
});
