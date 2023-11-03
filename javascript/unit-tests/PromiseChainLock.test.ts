import { ensure } from "../implementation/utils";
import { PromiseChainLock } from "../implementation/PromiseChainLock";
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

it('test lock/unlock ', async () => {
    const promiseChainLock = new PromiseChainLock();
    let countLocks = 0;
    const messages: string[] = [];
    async function doSomething(msg: string) {
        const unlocker = await promiseChainLock.acquireLock();
        ensure(countLocks == 0);
        countLocks += 1;
        messages.push(msg);
        await sleep(100);
        ensure(countLocks == 1);
        countLocks -= 1;
        unlocker(null);
    }
    doSomething("first");
    doSomething("second");
    doSomething("third");
    messages.push("zeroth");
    await promiseChainLock.acquireLock();
    ensure(messages.length == 4);
    ensure(messages[0] == "zeroth");
    ensure(messages[1] == "first");
    ensure(messages[2] == "second");
    ensure(messages[3] == "third");
});
