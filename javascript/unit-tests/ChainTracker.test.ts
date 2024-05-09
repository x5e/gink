import { BundleInfo } from "../implementation";
import { ChainTracker } from "../implementation/ChainTracker";
import { ensure } from "../implementation/utils";

it('track two bundles', async () => {
    const chainTracker = new ChainTracker({});
    const medallion = 521994040637930;
    const chainStart = 1662789574924000;
    const secondTime = 1662789590300000;

    const bundleInfo1: BundleInfo = { "timestamp": chainStart, medallion, chainStart, "comment": "node instance" };
    chainTracker.markAsHaving(bundleInfo1, true);

    const bundleInfo2: BundleInfo = {
        "timestamp": secondTime, medallion, chainStart, "priorTime": chainStart, "comment": "hello"
    };
    chainTracker.markAsHaving(bundleInfo2, true);

    const bundleInfo3 = chainTracker.getBundleInfo([medallion, chainStart]);
    if (!bundleInfo3) throw new Error("missing");
    ensure(bundleInfo3.medallion == medallion);
    ensure(bundleInfo3.chainStart == chainStart);
    ensure(bundleInfo3.timestamp == secondTime);
    ensure(bundleInfo3.priorTime == chainStart);
    ensure(bundleInfo3.comment == "hello");

    const chains = chainTracker.getChains();
    ensure(chains.length == 1);
    ensure(chains[0][0] == medallion);
    ensure(chains[0][1] == chainStart);
});
