import { Medallion, ChainStart, Timestamp, AddressableObject, Address, CommitInfo } from "./typedefs";
import { Commit as CommitProto } from "commit_pb";
import { assert } from "./utils";


/**
 * An open commit that you can add objects to.  It's a little funky because the timestamp
 * of the commit will be determined when it's closed, so the ID of any object added to the commit
 * isn't completely known until after it's closed.  (That's required to avoid objects referencing 
 * other objects with timestamps in the future).
 */
export class PendingCommit {

    private commitInfo: CommitInfo | null = null;
    private serialized: Uint8Array | null = null;

    constructor(private comment?: string) { }

    addAddressableObject(_obj: AddressableObject): Address {
        assert(!this.serialized);
        //TODO(https://github.com/google/gink/issues/32): fix this
        throw new Error("not implemented");
    }


    /**
     * Intended to be called by a GinkInstance to finalize a commit.
     * @param commitInfo object becomes attached to this commit, comment overwritten
     * @returns serialized 
     */
    seal(commitInfo: CommitInfo) {
        assert(!this.serialized);
        this.commitInfo = commitInfo;
        commitInfo.comment = this.comment;
        const commitProto = new CommitProto();
        commitProto.setTimestamp(commitInfo.timestamp);
        commitProto.setPreviousTimestamp(commitInfo.priorTime);
        commitProto.setChainStart(commitInfo.chainStart);
        commitProto.setMedallion(commitInfo.medallion);
        commitProto.setComment(commitInfo.comment);
        // TODO(https://github.com/google/gink/issues/32): add addressable objects
        this.serialized = commitProto.serializeBinary();
        return this.serialized;
    }

}
