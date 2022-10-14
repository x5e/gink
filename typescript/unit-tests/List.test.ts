import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { List } from "../library-implementation/List";
import { Muid } from "../library-implementation/typedefs";

test('push to a queue and peek', async function() {
    // set up the objects
    const store = new IndexedDbStore('list-test1', true);
    const instance = new GinkInstance(store);

    const queue: List = await instance.createQueue();
    await queue.push('dummy');
    const muid: Muid = await queue.push("Hello, World!");
    ensure(muid.timestamp > 0);

    const val = await queue.peek();
    ensure(val == "Hello, World!");
});


test('push twice', async function() {
    // set up the objects
    const store = new IndexedDbStore('list-test1', true);
    const instance = new GinkInstance(store);

    const queue: List = await instance.createQueue();
    const aMuid = await queue.push('A');
    const bMuid = await queue.push("B");
    console.log(`aMuid=${JSON.stringify(aMuid.timestamp)}`);
    console.log(`bMuid=${JSON.stringify(bMuid.timestamp)}`);

    const thing = store.getEntries(queue.address);
    for await (let val of thing) {
        console.log(`val=${JSON.stringify(val)}`);
    }

    for await (let val of queue.entries()) {
        console.log(`val=${JSON.stringify(val)}`);
    }
});
