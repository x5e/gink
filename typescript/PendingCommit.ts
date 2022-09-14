import { Medallion, ChainStart, Timestamp, Address, CommitInfo } from "./typedefs";
import { Commit as CommitProto } from "commit_pb";
import { assert } from "./utils";
import { AddressableObject } from "addressable_object_pb";


/**
 * An open commit that you can add objects to.  It's a little funky because the timestamp
 * of the commit will be determined when it's closed, so the ID of any object added to the commit
 * isn't completely known until after it's closed.  (That's required to avoid objects referencing 
 * other objects with timestamps in the future).
 */
export class PendingCommit {

    private commitInfo: CommitInfo | null = null;
    private serialized: Uint8Array | null = null;
    private commitProto = new CommitProto();
    private countItems = 0;
 
    constructor(private comment?: string) { 

    }

    get medallion(): Medallion | undefined {
        return this.commitInfo?.medallion;
    }
    get timestamp(): Timestamp | undefined {
        return this.commitInfo?.timestamp;
    }

    addAddressableObject(addressableObject: AddressableObject): Address {
        if (this.commitInfo)
            throw new Error("This commit has already been sealed.");
        const offset = ++this.countItems;
        this.commitProto.getAddressableObjectsMap().set(offset, addressableObject);
        return new class {
            constructor(private commit: PendingCommit, readonly offset: number) {}
            get medallion() { return this.commit.medallion; }
            get timestamp() { return this.commit.timestamp; }
        }(this, offset);
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
        this.commitProto.setTimestamp(commitInfo.timestamp);
        this.commitProto.setPreviousTimestamp(commitInfo.priorTime);
        this.commitProto.setChainStart(commitInfo.chainStart);
        this.commitProto.setMedallion(commitInfo.medallion);
        this.commitProto.setComment(commitInfo.comment);
        // TODO(https://github.com/google/gink/issues/32): add addressable objects
        this.serialized = this.commitProto.serializeBinary();
        return this.serialized;
    }

}
