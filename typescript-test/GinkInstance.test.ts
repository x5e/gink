import { GinkInstance, IndexedDbStore, ChangeSet, ensure, ChangeSetBytes, ChangeSetInfo } from "../typescript-impl";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { ChangeSet as ChangeSetMessage } from "gink/protoc.out/change_set_pb";

test('test commit', async () => {
    const store = new IndexedDbStore();
    const instance = new GinkInstance(store);
    const commitInfo = await instance.addChangeSet(new ChangeSet("hello world"));
    ensure(commitInfo.comment == "hello world");
    const chainTracker = await store.getChainTracker();
    const allChains = chainTracker.getChains();
    ensure(allChains.length == 1);
    ensure(allChains[0][0] == commitInfo.medallion);
    ensure(allChains[0][1] == commitInfo.chainStart);
    return "okay!";
});

test('uses claimed chain', async () => {
    const store = new IndexedDbStore("test", true);
    await store.ready;
    const commitBytes = makeChainStart("chain start comment", MEDALLION1, START_MICROS1);
    await store.addChangeSet(commitBytes);
    await store.claimChain(MEDALLION1, START_MICROS1);
    store.getCommits((commitBytes: ChangeSetBytes, _commitInfo: ChangeSetInfo) => {
        const commit = ChangeSetMessage.deserializeBinary(commitBytes);
        ensure(commit.getComment() == "chain start comment")
    })
    const instance = new GinkInstance(store);
    await instance.ready;
    const secondInfo = await instance.addChangeSet(new ChangeSet("Hello, Universe!"));
    ensure(
        secondInfo.medallion == MEDALLION1 &&
        secondInfo.priorTime == START_MICROS1 &&
        secondInfo.chainStart == START_MICROS1
    );
})

export const result = 1;
