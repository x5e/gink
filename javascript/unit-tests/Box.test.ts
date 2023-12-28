import { Box, IndexedDbStore, GinkInstance, MemoryStore, Bundler, Muid } from "../implementation/index";
import { ensure } from "../implementation/utils";

it('create a box; set and get data in it', async function () {
    // set up the objects
    for (const store of [new IndexedDbStore('Box.test1', true), new MemoryStore(true)]) {
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
        ensure(size3 == 0, size3.toString());
    }
});


it('set a box in a bundler', async function () {
    // set up the objects
    for (const store of [new IndexedDbStore('box.test2', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const aBox: Box = await instance.createBox();

        // set the value in a bundler
        const bundler = new Bundler();
        aBox.set("a value", bundler);

        // confirm that change isn't visible yet
        const size0 = await aBox.size();
        ensure(size0 == 0);

        await instance.addBundler(bundler);

        const size1 = await aBox.size();
        ensure(size1 == 1);
    }
});


it('create a box and set in same CS', async function () {
    // set up the objects
    for (const store of [new IndexedDbStore('box.test3', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        // create a box and set in on CL
        const bundler = new Bundler();
        const box: Box = await instance.createBox(bundler);
        const change: Muid = await box.set("a value", bundler);
        await instance.addBundler(bundler);

        // make sure the change and the box have the same timestamp
        ensure(box.address?.timestamp);
        ensure(box.address?.timestamp === change.timestamp);

        const val = await box.get();
        ensure(val == "a value");
    }
});

it('set a value in a box then clear it', async function () {
    for (const store of [new IndexedDbStore('box.test4', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);

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
    }
});

it('Box.toJson', async function () {
    for (const store of [new IndexedDbStore('box.toJson', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);

        // put a value into the box
        const box = await instance.createBox();

        const directory = await instance.createDirectory();
        await box.set(directory);

        const box2 = await instance.createBox();

        await directory.set('cheese', box2);

        await box2.set("fries");

        const asJson = await box.toJson();

        ensure(asJson == `{"cheese":"fries"}`);
    }
});
