import { assert } from "./utils";
import { ChainTracker } from "./ChainTracker";
import { CommitInfo } from "./typedefs";

test('track two commits', async () => {
    const chainTracker = new ChainTracker({});
    const medallion = 521994040637930;
    const chainStart = 1662789574924000;
    const secondTime = 1662789590300000;

    const commitInfo1: CommitInfo = { "timestamp": chainStart, medallion, chainStart, "comment": "node instance" };
    chainTracker.markIfNovel(commitInfo1, true);

    const commitInfo2: CommitInfo = {
        "timestamp": secondTime, medallion, chainStart, "priorTime": chainStart, "comment": "hello"
    }
    chainTracker.markIfNovel(commitInfo2, true);

    const commitInfo3 = chainTracker.getCommitInfo([medallion, chainStart]);
    assert(commitInfo3);
    assert(commitInfo3.medallion == medallion);
    assert(commitInfo3.chainStart == chainStart);
    assert(commitInfo3.timestamp == secondTime);
    assert(commitInfo3.priorTime == chainStart);
    assert(commitInfo3.comment == "hello");

    const chains = chainTracker.getChains();
    assert(chains.length == 1);
    assert(chains[0][0] == medallion);
    assert(chains[0][1] == chainStart);
});
