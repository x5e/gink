import { ensure, ChainTracker, ChangeSetInfo } from "../typescript-implementation";

test('track two commits', async () => {
    const chainTracker = new ChainTracker({});
    const medallion = 521994040637930;
    const chainStart = 1662789574924000;
    const secondTime = 1662789590300000;

    const commitInfo1: ChangeSetInfo = { "timestamp": chainStart, medallion, chainStart, "comment": "node instance" };
    chainTracker.markIfNovel(commitInfo1, true);

    const commitInfo2: ChangeSetInfo = {
        "timestamp": secondTime, medallion, chainStart, "priorTime": chainStart, "comment": "hello"
    }
    chainTracker.markIfNovel(commitInfo2, true);

    const commitInfo3 = chainTracker.getCommitInfo([medallion, chainStart]);
    ensure(commitInfo3);
    ensure(commitInfo3.medallion == medallion);
    ensure(commitInfo3.chainStart == chainStart);
    ensure(commitInfo3.timestamp == secondTime);
    ensure(commitInfo3.priorTime == chainStart);
    ensure(commitInfo3.comment == "hello");

    const chains = chainTracker.getChains();
    ensure(chains.length == 1);
    ensure(chains[0][0] == medallion);
    ensure(chains[0][1] == chainStart);
});
