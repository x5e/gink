import { ensure, matches } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { List } from "../library-implementation/List";
import { Muid } from "../library-implementation/typedefs";

test('push to a queue and peek', async function () {
    // set up the objects
    const store = new IndexedDbStore('list-test1', true);
    const instance = new GinkInstance(store);

    const queue: List = await instance.createList();
    await queue.push('dummy');
    const muid: Muid = await queue.push("Hello, World!");
    ensure(muid.timestamp > 0);

    const val = await queue.at(-1);
    ensure(val == "Hello, World!");
});


test('push and pop', async function () {
    // set up the objects
    const store = new IndexedDbStore('list-test2', true);
    const instance = new GinkInstance(store);

    const list: List = await instance.createList();
    await list.push('A');
    await list.push("B");
    await list.push("C");

    ensure(matches(await list.toArray(), ["A", "B", "C"]));
    const popped = await list.pop();
    ensure(popped == "C");
    ensure(matches(await list.toArray(), ["A", "B"]));
    const shifted = await list.shift();
    ensure(shifted == "A");
    ensure(matches(await list.toArray(), ["B"]));

    const dMuid = await list.push("D");
    await list.push("E");

    const poppedByMuid = await list.pop(dMuid);
    ensure(poppedByMuid == "D");

    await list.push("F");
    await list.push("G");
    ensure(matches(await list.toArray(), ["B", "E", "F", "G"]));

    const poppedByIndex = await list.pop(2);
    ensure(poppedByIndex == "F");
    ensure(matches(await list.toArray(), ["B", "E", "G"]));

});

test('size and at', async function () {
    // set up the objects
    const store = new IndexedDbStore('list-test3', true);
    const instance = new GinkInstance(store);

    const list: List = await instance.createList();
    await list.push('A');
    await list.push("B");
    await list.push("C");

    const size = await list.size();
    ensure(size == 3);

    const atEnd = await list.at(-1);
    ensure(atEnd == "C");
    const beginning = await list.at(0);
    ensure(beginning == "A");

    await list.pop();

    const size2 = await list.size();
    ensure(size2 == 2);

    const second = await list.at(1);
    ensure(second == "B");

    const third = await list.at(3);
    ensure(third == undefined);

});

test('entries', async function () {
    // set up the objects
    const store = new IndexedDbStore('list-entries-test', true);
    const instance = new GinkInstance(store);

    const list: List = await instance.createList();
    await list.push('A');
    await list.push("B");
    await list.push("C");

    const buffer = [];
    for await (const [muid, contents] of list.entries()) {
        const val = await list.pop(muid)
        ensure(val == contents, `val=${val}, contents=${contents}`);
        buffer.push(contents);
    }
    ensure(matches(buffer, ["A","B","C"]));
});

test('list-changeset', async function() {
    const store = new IndexedDbStore('list-changeset', true);
    const instance = new GinkInstance(store);

    const changeSet = new ChangeSet();
    const list: List = await instance.createList(changeSet);
    await list.push('A', changeSet);
    await list.push("B", changeSet);
    await list.push("C", changeSet);
    await instance.addChangeSet(changeSet);

    ensure(changeSet.timestamp != undefined && changeSet.timestamp > 0);
    ensure(list.address.timestamp == changeSet.timestamp);
    for await (const [muid, _] of list.entries()) {
        ensure(muid.timestamp == changeSet.timestamp);
    }

    const changeSet2 = new ChangeSet();
    list.shift(changeSet2);
    list.push("D", changeSet2);
    ensure(matches(await list.toArray(), ["A", "B", "C"]));
    await instance.addChangeSet(changeSet2);
    ensure(matches(await list.toArray(), ["B", "C", "D"]));
});

test('List.toJSON', async function() {
    // set up the objects
    const store = new IndexedDbStore('List.toJSON', true);
    const instance = new GinkInstance(store);

    const list: List = await instance.createList();
    await list.push('A');
    await list.push(true);
    await list.push(false);

    const subList = await instance.createList();
    await subList.push(33);
    await list.push(subList);

    const subDir = await instance.createDirectory();
    await subDir.set("cheese", "fries");
    await list.push(subDir);

    const bytes = new Uint8Array(3);
    bytes[0] = 255;
    bytes[1] = 94;
    bytes[2] = 32;
    await list.push(bytes);

    const asJson = await list.toJson();

    ensure(asJson == `["A",true,false,[33],{"cheese":"fries"},"FF5E20"]`, asJson);
});
