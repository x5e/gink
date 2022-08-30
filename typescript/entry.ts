eval("globalThis.test = function() {};");
import { IndexedDbStore } from "./IndexedDbStore";
import { makeChainStart, MEDALLION1, START_MICROS1, NEXT_TS1 } from "./test_utils";
import { CommitBytes, CommitInfo } from "./typedefs";
import { extractCommitInfo, info, setLogLevel, assert } from "./utils";
import { Commit } from "commit_pb";
import { Instance, CommitCoordinator } from "./Instance";

setLogLevel(1);

function getWebsocketTarget(): string {
    const loc = window.location;
    let target = "";
    if (loc.protocol === "https:") {
        target = "wss:";
    } else {
        target = "ws:";
    }
    target += "//" + loc.host;
    target += loc.pathname + "/";
    return target;
}

async function onCommit(commitInfo: CommitInfo) {
    document.getElementById('messages').innerHTML += 
        `${commitInfo.medallion}, ${commitInfo.timestamp}, ` + 
        `"${commitInfo.comment}"\n`;
}

(async () => {
    info("before");
    const store = new IndexedDbStore("test", true);
    await store.initialized;
    const commitBytes = makeChainStart("Hello, World!", MEDALLION1, START_MICROS1);
    const commitInfo = extractCommitInfo(commitBytes);
    await store.addCommit(commitBytes, commitInfo);
    await store.claimChain(MEDALLION1, START_MICROS1);
    store.getCommits((commitBytes: CommitBytes, _commitInfo: CommitInfo) => {
        const commit = Commit.deserializeBinary(commitBytes);
        info(`got commit with comment: ${commit.getComment()}`);
    })
    info("after checking store");
    const instance = new Instance(store);
    await instance.initialized;
    instance.addListener(onCommit);
    const chainManager = await instance.getChainManager();
    assert(chainManager.medallion == MEDALLION1);
    await chainManager.addCommit(new CommitCoordinator("Hello, Universe!"), NEXT_TS1);
    await instance.connectTo(getWebsocketTarget());
    info("connected!");
})();

