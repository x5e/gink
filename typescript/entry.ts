eval("globalThis.test = function() {};");
import { IndexedDbStore } from "./IndexedDbStore";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { CommitBytes, CommitInfo } from "./typedefs";
import { extractCommitInfo, info, setLogLevel, assert } from "./utils";
import { Commit } from "commit_pb";
import { GinkInstance } from "./GinkInstance";
import { PendingCommit } from "./PendingCommit";

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
    const instance = new GinkInstance(store);
    await instance.initialized;
    instance.addListener(onCommit);
    const secondInfo = await instance.addCommit(new PendingCommit("Hello, Universe!"));
    assert(
        secondInfo.medallion == MEDALLION1 &&
        secondInfo.priorTime == START_MICROS1 &&
        secondInfo.chainStart == START_MICROS1
        );
    await instance.connectTo(getWebsocketTarget());
    info("connected!");
})();

