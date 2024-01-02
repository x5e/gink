import { BundleInfo } from "../implementation";
import { ChainTracker } from "../implementation/ChainTracker";
import { ensure } from "../implementation/utils";

it('track two commits', async () => {
    const chainTracker = new ChainTracker({});
    const medallion = 521994040637930;
    const chainStart = 1662789574924000;
    const secondTime = 1662789590300000;

    const commitInfo1: BundleInfo = { "timestamp": chainStart, medallion, chainStart, "comment": "node instance" };
    chainTracker.markAsHaving(commitInfo1, true);

    const commitInfo2: BundleInfo = {
        "timestamp": secondTime, medallion, chainStart, "priorTime": chainStart, "comment": "hello"
    };
    chainTracker.markAsHaving(commitInfo2, true);

    const commitInfo3 = chainTracker.getCommitInfo([medallion, chainStart]);
    if (!commitInfo3) throw new Error("missing");
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
