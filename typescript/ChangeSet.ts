import { Medallion, Timestamp, Address, CommitInfo } from "./typedefs";
import { ChangeSet as ChangeSetMessage } from "change_set_pb";
import { Change as ChangeMessage } from "change_pb";


/**
 * An commit that you can add objects to.  It's a little funky because the timestamp
 * of the commit will be determined when it's finalized, so the ID of any object added to the commit
 * isn't completely known until after it's closed.  (That's required to avoid objects referencing 
 * other objects with timestamps in the future).  As a result, the timestamp property of this
 * and 
 */
export class ChangeSet {

    private commitInfo: CommitInfo | null = null;
    private serialized: Uint8Array | null = null;
    private changeSetMessage = new ChangeSetMessage();
    private countItems = 0;
 
    constructor(private pendingComment?: string, readonly preAssignedMedallion?: Medallion) { 
    }

    requireNotSealed() {
        if (this.commitInfo)
            throw new Error("This ChangeSet has already been sealed.");
    }

    set comment(value) {
        this.requireNotSealed();
        this.pendingComment = value;
    }

    get comment(): string {
        return this.pendingComment || this.commitInfo?.comment;
    }

    get medallion(): Medallion | undefined {
        return this.preAssignedMedallion || this.commitInfo?.medallion;
    }

    get timestamp(): Timestamp | undefined {
        return this.commitInfo?.timestamp;
    }

    /**
     * 
     * @param changeMessage a protobuf Change ready to be serialized
     * @returns an Address who's offset is immediately available and whose medallion and
     * timestamp become defined when this ChangeSet is sealed.
     */
    addChange(changeMessage: ChangeMessage): Address {
        this.requireNotSealed();
        const offset = ++this.countItems;
        this.changeSetMessage.getChangesMap().set(offset, changeMessage);
        return new class {
            constructor(private changeSet: ChangeSet, readonly offset: number) {}
            get medallion() { return this.changeSet.medallion; }
            get timestamp() { return this.changeSet.timestamp; }
        }(this, offset);
    }

    removeChange(address: Address) {
        this.requireNotSealed();
        const map = this.changeSetMessage.getChangesMap();
        map.delete(address.offset);
    }


    /**
     * Intended to be called by a GinkInstance to finalize a commit.
     * @param commitInfo the commit metadata to add when serializing
     * @returns serialized 
     */
    seal(commitInfo: CommitInfo) {
        this.requireNotSealed();
        if (this.preAssignedMedallion && this.preAssignedMedallion != commitInfo.medallion) {
            throw new Error("specifed commitInfo doesn't match pre-assigned medallion");
        }
        this.commitInfo = {...commitInfo};
        this.commitInfo.comment = this.pendingComment;
        this.changeSetMessage.setTimestamp(commitInfo.timestamp);
        this.changeSetMessage.setPreviousTimestamp(commitInfo.priorTime);
        this.changeSetMessage.setChainStart(commitInfo.chainStart);
        this.changeSetMessage.setMedallion(commitInfo.medallion);
        this.changeSetMessage.setComment(this.commitInfo.comment);
        this.serialized = this.changeSetMessage.serializeBinary();
        return this.serialized;
    }
}
