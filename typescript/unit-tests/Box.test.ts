import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { Box } from "../library-implementation/Box";
import { Muid } from "../library-implementation/typedefs";

test('create a box; set and get data in it', async function() {
    // set up the objects
    const store = new IndexedDbStore('box-test1', true);
    const instance = new GinkInstance(store);
    const aBox: Box = await instance.createBox();

    // set a value
    await aBox.set("a value");

    // check that the desired result exists in the database
    const result = await aBox.get();
    ensure(result == "a value", `result is ${result}`);

    // check the appropriate size
    const size1 = await aBox.size();
    ensure(size1 == 1);

    // set another value
    await aBox.set("another value");
    const result2 = await aBox.get();
    ensure(result2 == "another value");

    // Make sure the "clear" operation works as intended
    await aBox.clear();
    const result3 = await aBox.get();
    ensure(result3 === undefined);

    const size3 = await aBox.size();
    ensure(size3 == 0);
});


test('set a box in a change set', async function() {
    // set up the objects
    const instance = new GinkInstance(new IndexedDbStore('box-test2', true));
    const aBox: Box = await instance.createBox();

    // set the value in a change set
    const changeSet = new ChangeSet();
    aBox.set("a value", changeSet);

    // confirm that change isn't visible yet
    const size0 = await aBox.size();
    ensure(size0 == 0);

    await instance.addChangeSet(changeSet);

    const size1 = await aBox.size();
    ensure(size1 == 1);

});


test('create a box and set in same CS', async function() {
    // set up the objects
    const store = new IndexedDbStore('box-test3', true);
    const instance = new GinkInstance(store);

    // create a box and set in on CL
    const changeSet = new ChangeSet();
    const box: Box = await instance.createBox(changeSet);
    const change: Muid = await box.set("a value", changeSet);
    await instance.addChangeSet(changeSet);

    // make sure the change and the box have the same timestamp
    ensure(box.address?.timestamp);
    ensure(box.address?.timestamp === change.timestamp);

    // console.log(JSON.stringify(await store.getAllEntryKeys()));
    const val = await box.get();
    ensure(val == "a value");
});

test('set a value in a box then clear it', async function() {
    const instance = new GinkInstance(new IndexedDbStore('box-test4', true));

    // put a value into the box
    const box = await instance.createBox();
    await box.set("foo");

    // make sure it's there
    const current = await box.get();
    ensure(current == 'foo');

    // clear the box
    await box.clear();

    // make sure the contents are gone
    const after = await box.get();
    ensure(after === undefined);

});

test('Box.toJson', async function() {
    const instance = new GinkInstance(new IndexedDbStore('Box.toJson', true));

    // put a value into the box
    const box = await instance.createBox();

    const directory = await instance.createDirectory();
    await box.set(directory);

    const box2 = await instance.createBox();

    await directory.set('cheese', box2);

    await box2.set("fries");

    const asJson = await box.toJson();

    ensure(asJson == `{"cheese":"fries"}`);

});
