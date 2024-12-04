import { sleep } from "./test_utils";
import {
    Database,
    MemoryStore,
    Box,
    IndexedDbStore,
    Sequence,
    Muid,
    Value,
    Directory,
    Property,
} from "../implementation";
import { ensure, matches, generateTimestamp } from "../implementation/utils";

it("push to a queue and peek", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const queue: Sequence = await Sequence.create(instance);
        await queue.push("dummy");
        const muid: Muid = await queue.push("Hello, World!");
        ensure(muid.timestamp! > 0);
        const val = await queue.at(-1);
        ensure(val === "Hello, World!");
        await store.close();
    }
});

it("push and pop", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-test2", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const list: Sequence = await Sequence.create(instance);
        await list.push("A");
        await list.push("B");
        await list.push("C");

        ensure(matches(await list.toArray(), ["A", "B", "C"]));
        const popped = await list.pop();
        ensure(popped === "C");
        /*
        for (const entry of await store.getAllEntries()) {
            console.log(entry);
        }
        for (const exit of await store.getAllExits()) {
            console.log(exit);
        }
        */
        const have = JSON.stringify(await list.toArray());
        ensure(matches(await list.toArray(), ["A", "B"]), have);
        const shifted = await list.shift();
        ensure(shifted === "A");
        ensure(matches(await list.toArray(), ["B"]));

        const dMuid = await list.push("D");
        await list.push("E");

        const poppedByMuid = await list.pop(dMuid);
        ensure(poppedByMuid === "D");

        await list.push("F");
        await list.push("G");
        ensure(matches(await list.toArray(), ["B", "E", "F", "G"]));

        const poppedByIndex = await list.pop(2);
        ensure(poppedByIndex === "F");
        ensure(matches(await list.toArray(), ["B", "E", "G"]));
    }
});

it("size and at", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-test3", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const list: Sequence = await Sequence.create(instance);
        await list.push("A");
        await list.push("B");
        await list.push("C");

        const size = await list.size();
        ensure(size === 3);

        const atEnd = await list.at(-1);
        ensure(atEnd === "C");
        const beginning = await list.at(0);
        ensure(beginning === "A");

        const offEnd = await list.at(-4);
        ensure(offEnd === undefined);

        const nearEnd = await list.at(-3);
        ensure(nearEnd === "A");

        await list.pop();

        const size2 = await list.size();
        ensure(size2 === 2);

        const second = await list.at(1);
        ensure(second === "B");

        const third = await list.at(3);
        ensure(third === undefined);
    }
});

it("entries", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-test4", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const list: Sequence = await Sequence.create(instance);
        await list.push("A");
        await list.push("B");
        await list.push("C");

        const buffer = <Value[]>[];
        for await (const [muid, contents] of list.entries()) {
            const val = await list.pop(muid);
            ensure(val === contents, `val=${val}, contents=${contents}`);
            buffer.push(<Value>contents);
        }
        ensure(matches(buffer, ["A", "B", "C"]));
    }
});

it("list-changeset", async function () {
    for (const store of [
        new IndexedDbStore("list-test5", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        let bundler = await instance.startBundle();
        const list: Sequence = await Sequence.create(instance, {bundler});
        await list.push("A", {bundler});
        await list.push("B", {bundler});
        await list.push("C", {bundler});
        const info = await bundler.commit();

        ensure(info.timestamp !== undefined && info.timestamp > 0);
        ensure(list.address.timestamp === info.timestamp);
        for await (const [muid, _] of list.entries()) {
            ensure(muid.timestamp === info.timestamp);
        }

        bundler = await instance.startBundle();
        await list.shift(false, {bundler});
        await list.push("D", {bundler});
        ensure(matches(await list.toArray(), ["A", "B", "C"]));
        await bundler.commit();
        const result = await list.toArray();
        ensure(matches(result, ["B", "C", "D"]));
    }
});

it("List.toJSON", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-toJSON", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const list: Sequence = await Sequence.create(instance);
        await list.push("A");
        await list.push(true);
        await list.push(false);

        const subList = await Sequence.create(instance);
        await subList.push(33);
        await list.push(subList);

        const subDir = await Directory.create(instance);
        await subDir.set("cheese", "fries");
        await list.push(subDir);

        const bytes = new Uint8Array(3);
        bytes[0] = 255;
        bytes[1] = 94;
        bytes[2] = 32;
        await list.push(bytes);

        const asJson = await list.toJson();

        ensure(
            asJson === `["A",true,false,[33],{"cheese":"fries"},"FF5E20"]`,
            asJson
        );
    }
});

it("List.asOf", async function () {
    // set up the objects
    for (const store of [
        new IndexedDbStore("list-asOf", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const list: Sequence = await Sequence.create(instance);
        const time0 = Date.now() * 1000;
        await sleep(10);
        await list.push("A");
        await sleep(10);
        const time1 = Date.now() * 1000;
        await sleep(10);
        await list.push(true);
        await sleep(10);
        const time2 = Date.now() * 1000;
        await sleep(10);
        await list.push(false);
        await sleep(10);
        const time3 = Date.now() * 1000;

        ensure(
            matches(await list.toArray(Infinity, time3), ["A", true, false])
        );
        ensure(matches(await list.toArray(Infinity, time2), ["A", true]));
        ensure(matches(await list.toArray(Infinity, time1), ["A"]));
        ensure(matches(await list.toArray(Infinity, time0), []));

        ensure(matches(await list.toArray(Infinity, -1), ["A", true]));
        ensure(matches(await list.toArray(Infinity, -2), ["A"]));
        ensure(matches(await list.toArray(Infinity, -3), []));
    }
});

it("List.clear", async function () {
    for (const store of [
        new IndexedDbStore("list-clear", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const list: Sequence = await Sequence.create(instance);
        await list.push("hello");
        await list.push("world");
        let size = await list.size();
        ensure(size === 2);
        const clearMuid = await list.clear();
        size = await list.size();
        ensure(size === 0);
        await list.push("goodbye");
        size = await list.size();
        ensure(size === 1);
        size = await list.size(clearMuid.timestamp);
        ensure(size === 2);
        await list.clear(true);
        size = await list.size(clearMuid.timestamp);
        ensure(size === 0, `size=${size}`);
    }
});

it("List.purge_pop", async function () {
    for (const store of [
        new IndexedDbStore("list-purgePop", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;
        const seq = await Sequence.create(instance);
        await seq.push("foo");
        await seq.push("bar");
        const beforeFirstPop = generateTimestamp();
        const popped = await seq.pop();
        ensure(popped === "bar", `popped=${popped}`);
        ensure(
            matches(["foo"], await seq.toArray()),
            (await seq.toArray()).toString()
        );
        const previous = await seq.toArray(Infinity, beforeFirstPop);

        ensure(
            matches(["foo", "bar"], previous),
            "previous=" + previous.toString()
        );
        const shifted = await seq.shift(true);
        ensure(shifted === "foo");
        ensure(matches(["bar"], await seq.toArray(Infinity, beforeFirstPop)));
    }
});

it("List.move", async function () {
    for (const store of [
        new IndexedDbStore("list-move", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const seq = await Sequence.create(instance);

        await seq.push("A");
        await sleep(100);
        await seq.push("B");
        await sleep(100);
        const cMuid = await seq.push("C");
        await seq.push("D");
        await sleep(100);

        ensure((await seq.toArray()).toString() === "A,B,C,D");

        await seq.move(0, -1);
        ensure(
            (await seq.toArray()).toString() === "B,C,D,A",
            (await seq.toArray()).toString()
        );

        await seq.move(2, 0);
        ensure(
            (await seq.toArray()).toString() === "D,B,C,A",
            (await seq.toArray()).toString()
        );

        await seq.move(cMuid, 1);
        ensure(
            (await seq.toArray()).toString() === "D,C,B,A",
            (await seq.toArray()).toString()
        );
    }
});

it("extend", async function () {
    for (const store of [
        new IndexedDbStore("list-extend", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const seq = await Sequence.create(instance);
        const array = [0, 1, 2, 3, 4, 5, 6];
        await seq.extend(array);
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(6)) === 6);

        const bundler = await instance.startBundle();
        const array2 = [7, 8, 9, 10];
        await seq.extend(array2, {bundler});
        await bundler.commit();
        ensure((await seq.at(7)) === 7);
        ensure((await seq.at(10)) === 10);
    }
});

it("List.reset", async function () {
    for (const store of [
        new IndexedDbStore("list-reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({store});
        await instance.ready;

        const seq = await Sequence.create(instance);
        const array = [0, 1, 2, 3, 4, 5, 6];
        await seq.extend(array);
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(6)) === 6);
        const afterExtend = generateTimestamp();

        const array2 = [7, 8, 9];
        await seq.extend(array2);
        ensure((await seq.size()) === 10);
        const afterSecond = generateTimestamp();

        await seq.reset(afterExtend);
        ensure((await seq.size()) === 7);
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(6)) === 6);

        await seq.reset();
        ensure((await seq.size()) === 0);


        await seq.reset(afterSecond);
        ensure((await seq.size()) === 10, (await seq.size()).toString());
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(9)) === 9);

        await seq.push(10);
        await seq.push(11);
        await seq.move(10, 0);

        await seq.reset(afterSecond);
        ensure((await seq.size()) === 10);
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(9)) === 9);

        await seq.pop(0);
        ensure((await seq.size()) === 9);
        await seq.reset(afterSecond);
        ensure((await seq.size()) === 10);
        ensure((await seq.at(0)) === 0);
        ensure((await seq.at(9)) === 9);

        // Test recursive reset
        await seq.clear();
        const box = await Box.create(instance);
        const dir = await Directory.create(instance);
        await box.set(dir);
        await dir.set("foo", "bar");
        await seq.push(box);
        const afterBox = generateTimestamp();
        await dir.set("foo", "baz");
        await box.set("changed!");
        await seq.push(1);
        const beforeReset = generateTimestamp();
        await seq.reset(afterBox, true);
        ensure((await seq.size()) === 1);
        ensure((await box.get()) instanceof Directory);
        ensure((await dir.get("foo")) === "bar");

        // Reset back
        await seq.reset(beforeReset, true);
        ensure((await seq.size()) === 2);
        ensure((await seq.at(1)) === 1);
        ensure((await box.get()) === "changed!");
        // This will not have been reset, since the directory was not held
        // in the box at the time of the reset
        ensure((await dir.get("foo")) === "bar");

        await seq.shift(); // Remove the box

        await seq.reset(beforeReset, true);
        ensure((await seq.size()) === 2);
        ensure((await seq.at(1)) === 1);
        ensure((await box.get()) === "changed!");
    }
});
