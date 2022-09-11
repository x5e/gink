import { assert } from "./utils";
import { PromiseChainLock } from "./PromiseChainLock";
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

test('test lock/unlock ', async () => {
    const promiseChainLock = new PromiseChainLock();
    let countLocks = 0;
    const messages = [];
    async function doSomething(msg: string) {
        const unlocker = await promiseChainLock.acquireLock();
        assert(countLocks == 0);
        countLocks += 1;
        messages.push(msg);
        await sleep(100);
        assert(countLocks == 1);
        countLocks -= 1;
        unlocker(null);
    }
    doSomething("first");
    doSomething("second");
    doSomething("third");
    messages.push("zeroth");
    await promiseChainLock.acquireLock();
    assert(messages.length == 4);
    assert(messages[0] == "zeroth");
    assert(messages[1] == "first");
    assert(messages[2] == "second");
    assert(messages[3] == "third");
});
