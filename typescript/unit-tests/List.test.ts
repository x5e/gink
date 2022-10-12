import { ensure } from "../library-implementation/utils";
import { GinkInstance } from "../library-implementation/GinkInstance";
import { ChangeSet } from "../library-implementation/ChangeSet";
import { IndexedDbStore } from "../library-implementation/IndexedDbStore";
import { List } from "../library-implementation/List";
import { Muid } from "../library-implementation/typedefs";

test('push to a queue and peek', async function() {
    // set up the objects
    const store = new IndexedDbStore('box-test1', true);
    const instance = new GinkInstance(store);

    const queue: List = await instance.createQueue();
    await queue.push('dummy');
    const muid: Muid = await queue.push("Hello, World!");
    ensure(muid.timestamp > 0);

    const val = await queue.peek();
    ensure(val == "Hello, World!");
});