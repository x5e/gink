import { GinkInstance } from "./GinkInstance";
import { IndexedDbStore } from "./IndexedDbStore";
import { PendingCommit } from "./PendingCommit";

test('test commit', async () => {
    const store = new IndexedDbStore();
    const instance = new GinkInstance(store);
    await instance.addCommit(new PendingCommit("hello world"));
});

export const result = 1;