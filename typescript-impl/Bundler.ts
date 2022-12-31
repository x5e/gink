import { Muid, BundleInfo, Medallion, Timestamp } from "./typedefs";
import { Bundle as BundleBuilder } from "gink/protoc.out/bundle_pb";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { ensure } from "./utils";

export class Bundler {
    // note: this class is unit tested as part of Store.test.ts
    private commitInfo: BundleInfo | null = null;
    private serialized: Uint8Array | null = null;
    private bundleBuilder = new BundleBuilder();
    private countItems = 0;
 
    constructor(private pendingComment?: string, readonly preAssignedMedallion?: Medallion) { 
    }

    private requireNotSealed() {
        if (this.commitInfo)
            throw new Error("This Bundler has already been sealed.");
    }

    get bytes() {
        return ensure(this.serialized, "not yet sealed!");
    }

    set comment(value) {
        this.requireNotSealed();
        this.pendingComment = value;
    }

    get comment(): string | undefined {
        return this.pendingComment || this.commitInfo?.comment;
    }

    get medallion(): Medallion | undefined {
        return this.preAssignedMedallion || this.commitInfo?.medallion;
    }

    get timestamp(): Timestamp | undefined {
        return this.commitInfo?.timestamp;
    }

    addEntry(entryBuilder: EntryBuilder): Muid {
        return this.addChange((new ChangeBuilder()).setEntry(entryBuilder));
    }

    addContainer(containerBuilder: ContainerBuilder): Muid {
        return this.addChange((new ChangeBuilder()).setContainer(containerBuilder));
    }

    /**
     * 
     * @param changeBuilder a protobuf Change ready to be serialized
     * @returns an Address who's offset is immediately available and whose medallion and
     * timestamp become defined when this Bundle is sealed.
     */
    addChange(changeBuilder: ChangeBuilder): Muid {
        this.requireNotSealed();
        const offset = ++this.countItems;
        this.bundleBuilder.getChangesMap().set(offset, changeBuilder);
        // Using an anonymous class here because I only need the interface of Address
        // but I need some non-trivial behavior: the timestamp and possibly medallion 
        // are undefined until the associated bundle is finalized, then all of the 
        // components of the address become well defined.
        return new class {
            constructor(private bundler: Bundler, readonly offset: number) {}
            get medallion() { return this.bundler.medallion; }
            get timestamp() { return this.bundler.timestamp; }
        }(this, offset);
    }

    removeChange(address: Muid) {
        this.requireNotSealed();
        const map = this.bundleBuilder.getChangesMap();
        map.delete(address.offset);
    }


    /**
     * Intended to be called by a GinkInstance to finalize a commit.
     * @param commitInfo the commit metadata to add when serializing
     * @returns serialized 
     */
    seal(commitInfo: BundleInfo): BundleInfo {
        this.requireNotSealed();
        if (this.preAssignedMedallion && this.preAssignedMedallion != commitInfo.medallion) {
            throw new Error("specifed commitInfo doesn't match pre-assigned medallion");
        }
        this.commitInfo = {...commitInfo};
        this.commitInfo.comment = this.pendingComment;
        this.bundleBuilder.setTimestamp(commitInfo.timestamp);
        this.bundleBuilder.setPreviousTimestamp(commitInfo.priorTime);
        this.bundleBuilder.setChainStart(commitInfo.chainStart);
        this.bundleBuilder.setMedallion(commitInfo.medallion);
        this.bundleBuilder.setComment(this.commitInfo.comment);
        this.serialized = this.bundleBuilder.serializeBinary();
        return this.commitInfo;
    }
}
