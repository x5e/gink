import { GinkInstance, IndexedDbStore, Bundler, BundleInfo, MemoryStore } from "../implementation";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { ensure } from "../implementation/utils";
import { BundleBytes } from "../implementation/typedefs";
import { BundleBuilder } from "../implementation/builders";

it('test commit', async () => {
    for (const store of [new IndexedDbStore('GinkInstance.commit', true), new MemoryStore(true)]) {
        const instance = new GinkInstance(store);
        const commitInfo = await instance.addBundler(new Bundler("hello world"));
        ensure(commitInfo.comment == "hello world");
        const chainTracker = await store.getChainTracker();
        const allChains = chainTracker.getChains();
        ensure(allChains.length == 1);
        ensure(allChains[0][0] == commitInfo.medallion);
        ensure(allChains[0][1] == commitInfo.chainStart);
        return "okay!";
    }
});

it('uses claimed chain', async () => {
    for (const store of [new IndexedDbStore('GinkInstance.test', true), new MemoryStore(true)]) {
        await store.ready;
        const commitBytes = makeChainStart("chain start comment", MEDALLION1, START_MICROS1);
        await store.addBundle(commitBytes);
        await store.claimChain(MEDALLION1, START_MICROS1);
        await store.getCommits((commitBytes: BundleBytes, _commitInfo: BundleInfo) => {
            const commit = <BundleBuilder>BundleBuilder.deserializeBinary(commitBytes);
            ensure(commit.getComment() == "chain start comment");
        });
        const instance = new GinkInstance(store);
        await instance.ready;
        const secondInfo = await instance.addBundler(new Bundler("Hello, Universe!"));
        ensure(
            secondInfo.medallion == MEDALLION1 &&
            secondInfo.priorTime == START_MICROS1 &&
            secondInfo.chainStart == START_MICROS1
        );
    }
});

export const result = 1;
