import {
    Box,
    IndexedDbStore,
    Database,
    MemoryStore,
    Muid,
} from "../implementation/index";
import { ensure, generateTimestamp, isDate } from "../implementation/utils";

it("create a box; set and get data in it", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("Box.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const aBox: Box = await Box.create(instance);

        // set a value
        await aBox.set("a value");

        // check that the desired result exists in the database
        const result = await aBox.get();
        ensure(result === "a value", `result is ${result}`);

        // check the appropriate size
        const size1 = await aBox.size();
        ensure(size1 === 1);

        // set another value
        await aBox.set("another value");
        const result2 = await aBox.get();
        ensure(result2 === "another value");

        // Make sure the "clear" operation works as intended
        await aBox.clear();
        const result3 = await aBox.get();
        ensure(result3 === undefined);

        const size3 = await aBox.size();
        ensure(size3 === 0, size3.toString());
    }
});

it("set a box in a bundler", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("box.test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const aBox: Box = await Box.create(instance);

        // set the value in a bundler
        const bundler = await instance.startBundle();
        aBox.set("a value", { bundler });

        // confirm that change isn't visible yet
        const size0 = await aBox.size();
        ensure(size0 === 0);

        await bundler.commit();

        const size1 = await aBox.size();
        ensure(size1 === 1);
    }
});

it("create a box and set in same CS", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("box.test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        // create a box and set in on CL
        const bundler = await instance.startBundle();
        const box: Box = await Box.create(instance, { bundler });
        const change: Muid = await box.set("a value", { bundler });
        await bundler.commit();

        // make sure the change and the box have the same timestamp
        ensure(box.address?.timestamp);
        ensure(box.address?.timestamp === change.timestamp);

        const val = await box.get();
        ensure(val === "a value");
    }
});

it("set a value in a box then clear it", async function () {
    for (const store of [
        new IndexedDbStore("box.test4", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        // put a value into the box
        const box = await Box.create(instance);
        await box.set("foo");

        // make sure it's there
        const current = await box.get();
        ensure(current === "foo");

        // clear the box
        await box.clear();

        // make sure the contents are gone
        const after = await box.get();
        ensure(after === undefined);
    }
});

it("Box.toJson", async function () {
    for (const store of [
        new IndexedDbStore("box.toJson", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        // put a value into the box
        const box = await Box.create(instance);

        await box.set("fries");

        const asJson = await box.toJson();

        ensure(asJson === `["fries"]`, `asJson="${asJson}"`);
    }
});

it("Box.Store", async function () {
    for (const store of [
        new IndexedDbStore("box.Store", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        // put a value into the box
        const box = await Box.create(instance);

        var date = new Date();
        await box.set(date);
        var expectDate = <Date>await box.get();

        ensure(isDate(expectDate) && expectDate.getTime() === date.getTime());

        var int = BigInt("137");
        await box.set(int);
        var expectInt = await box.get();
        ensure(expectInt === int);

        var floating = 137;
        await box.set(floating);
        var expectFloating = await box.get();
        ensure(expectFloating === floating);
    }
});

/*
it("Box.reset", async function () {
    for (const store of [
        new IndexedDbStore("box.reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const box = await Box.create(instance);
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(box, "foo");
        await prop2.set(box, "bar");

        await box.set("value 1");
        const afterSet = generateTimestamp();
        await box.set("changed");
        await prop1.set(box, "foo2");
        await prop2.set(box, "bar2");
        const afterSecond = generateTimestamp();
        await box.reset({ toTime: afterSet });
        ensure((await box.get()) === "value 1");
        ensure((await prop1.get(box)) === "foo");
        ensure((await prop2.get(box)) === "bar");
        await box.reset();
        ensure((await box.get()) === undefined);
        ensure((await prop1.get(box)) === undefined);
        ensure((await prop2.get(box)) === undefined);
        await box.reset({ toTime: afterSecond, skipProperties: true });
        ensure((await box.get()) === "changed");
        ensure((await prop1.get(box)) === undefined);
        ensure((await prop2.get(box)) === undefined);

        const dir = await Directory.create(instance);
        await box.set(dir);
        await dir.set("cheese", "fries");
        const resetTo = generateTimestamp();
        await dir.set("cheese", "no fries");
        const noFries = generateTimestamp();
        ensure((await dir.get("cheese")) === "no fries");
        await box.reset({ toTime: resetTo, recurse: true });
        ensure((await dir.get("cheese")) === "fries");

        await box.clear();
        ensure((await box.get()) === undefined);
        await box.reset({ toTime: resetTo });

        ensure(typeof (await box.get()) === "object");
        ensure((await dir.get("cheese")) === "fries");
        await box.reset({ toTime: noFries, recurse: true });
        ensure((await dir.get("cheese")) === "no fries");
    }
});
*/
