import { GinkInstance } from "./GinkInstance";
import { IndexedDbStore } from "./IndexedDbStore";
import { PendingCommit } from "./PendingCommit";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { extractCommitInfo, assert } from "./utils";
import { Commit } from "commit_pb";
import { CommitBytes, CommitInfo } from "./typedefs";


test('test commit', async () => {
    const store = new IndexedDbStore();
    const instance = new GinkInstance(store);
    const commitInfo = await instance.addPendingCommit(new PendingCommit("hello world"));
    assert(commitInfo.comment == "hello world");
    const chainTracker = await store.getChainTracker();
    const allChains = chainTracker.getChains();
    assert(allChains.length == 1);
    assert(allChains[0][0] == commitInfo.medallion);
    assert(allChains[0][1] == commitInfo.chainStart);
    return "okay!";
});

test('uses claimed chain', async () => {
    const store = new IndexedDbStore("test", true);
    await store.initialized;
    const commitBytes = makeChainStart("chain start comment", MEDALLION1, START_MICROS1);
    const commitInfo = extractCommitInfo(commitBytes);
    await store.addCommit(commitBytes, commitInfo);
    await store.claimChain(MEDALLION1, START_MICROS1);
    store.getCommits((commitBytes: CommitBytes, _commitInfo: CommitInfo) => {
        const commit = Commit.deserializeBinary(commitBytes);
        assert(commit.getComment() == "chain start comment")
    })
    const instance = new GinkInstance(store);
    await instance.initialized;
    const secondInfo = await instance.addPendingCommit(new PendingCommit("Hello, Universe!"));
    assert(
        secondInfo.medallion == MEDALLION1 &&
        secondInfo.priorTime == START_MICROS1 &&
        secondInfo.chainStart == START_MICROS1
    );
})

export const result = 1;
