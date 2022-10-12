import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { Box } from "../library-implementation/Box";

test('create a box; set and get data in it', async function() {
    // set up the objects
    const instance = new GinkInstance(new IndexedDbStore('box-test1', true));
    const aBox: Box = await instance.createBox();

    // set a value
    await aBox.set("a value");

    // check that the desired result exists in the database
    const result = await aBox.get();
    ensure(result == "a value");

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
