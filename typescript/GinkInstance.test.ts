import { assert } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { IndexedDbStore } from "./IndexedDbStore";
import { PendingCommit } from "./PendingCommit";

test('test commit', async () => {
    const store = new IndexedDbStore();
    const instance = new GinkInstance(store);
    const commitInfo = await instance.addCommit(new PendingCommit("hello world"));
    assert(commitInfo.comment == "hello world");
    const chainTracker = await store.getChainTracker();
    const allChains = chainTracker.getChains();
    assert(allChains.length == 1);
    assert(allChains[0][0] == commitInfo.medallion);
    assert(allChains[0][1] == commitInfo.chainStart);
    return "okay!";
});

export const result = 1;