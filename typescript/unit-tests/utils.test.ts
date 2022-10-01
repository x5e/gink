import { extractCommitInfo, makeMedallion, assert } from "../library-code/utils";
import { ChangeSet as ChangeSetMessage } from "change_set_pb";

test('extract commit info', function() {
    const medallion = makeMedallion();
    const nowMicros = Date.now() * 1000;
    const chainStart = nowMicros;
    const priorTime = chainStart + 1;
    const timestamp = priorTime + 1;
    const comment = "Hello, World!";
    const changeSetMessage = new ChangeSetMessage();
    changeSetMessage.setChainStart(chainStart);
    changeSetMessage.setTimestamp(timestamp);
    changeSetMessage.setPreviousTimestamp(priorTime);
    changeSetMessage.setMedallion(medallion);
    changeSetMessage.setComment(comment);
    const serialized = changeSetMessage.serializeBinary();
    const commitInfo = extractCommitInfo(serialized);
    assert(commitInfo.medallion == medallion);
    assert(commitInfo.chainStart == chainStart);
    assert(commitInfo.priorTime == priorTime);
    assert(commitInfo.comment == comment);
})
