eval("globalThis.test = function() {};");
import { IndexedDbStore } from "./IndexedDbStore";
import { makeChainStart, MEDALLION1, START_MICROS1 } from "./test_utils";
import { CommitBytes, CommitInfo } from "./typedefs";
import { extractCommitInfo, info, setLogLevel } from "./utils";
import { Commit } from "commit_pb";

(async () => {
    setLogLevel(1);
    info("before");
    const store = new IndexedDbStore("test", true);
    await store.initialized;
    const commitBytes = makeChainStart("hello", MEDALLION1, START_MICROS1);
    const commitInfo = extractCommitInfo(commitBytes);
    await store.addCommit(commitBytes, commitInfo);
    store.getCommits((commitBytes: CommitBytes, _commitInfo: CommitInfo) => {
        const commit = Commit.deserializeBinary(commitBytes);
        info(`got commit with comment: ${commit.getComment()}`);
    })
    info("after");
})();
