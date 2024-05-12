import { Muid, BundleInfo, Medallion, Timestamp, BundleView, Bytes } from "./typedefs";
import { BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder } from "./builders";
import { ensure } from "./utils";

export class Bundler implements BundleView {
    // note: this class is unit tested as part of Store.test.ts
    private _bundleInfo: BundleInfo | null = null;
    private serialized: Uint8Array | null = null;
    private _builder = new BundleBuilder();
    private countItems = 0;

    constructor(private pendingComment?: string, readonly preAssignedMedallion?: Medallion) {
    }

    private requireNotSealed() {
        if (this._bundleInfo)
            throw new Error("This Bundler has already been sealed.");
    }

    get info(): BundleInfo {
        return ensure(this._bundleInfo, "not yet sealed");
    }

    get bytes(): Bytes {
        return ensure(this.serialized, "not yet sealed!");
    }

    get builder(): BundleBuilder {
        if (!this._bundleInfo)
            throw new Error("Bundle not yet sealed.");
        return this._builder;
    }

    set comment(value) {
        this.requireNotSealed();
        this.pendingComment = value;
    }

    get comment(): string | undefined {
        return this.pendingComment || this._bundleInfo?.comment;
    }

    get medallion(): Medallion | undefined {
        return this.preAssignedMedallion || this._bundleInfo?.medallion;
    }

    get timestamp(): Timestamp | undefined {
        return this._bundleInfo?.timestamp;
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
        this._builder.getChangesMap().set(offset, changeBuilder);
        // Using an anonymous class here because I only need the interface of Address,
        // but I need some non-trivial behavior: the timestamp and possibly medallion
        // are undefined until the associated bundle is finalized, then all the
        // components of the address become well-defined.
        return new class {
            constructor(private bundler: Bundler, readonly offset: number) { }
            get medallion() { return this.bundler.medallion; }
            get timestamp() { return this.bundler.timestamp; }
        }(this, offset);
    }

    removeChange(address: Muid) {
        this.requireNotSealed();
        const map = this._builder.getChangesMap();
        map.delete(address.offset);
    }


    /**
     * Intended to be called by a Database to finalize a bundle.
     * @param bundleInfo the bundle metadata to add when serializing
     * @returns serialized
     */
    seal(bundleInfo: BundleInfo): BundleInfo {
        this.requireNotSealed();
        if (this.preAssignedMedallion && this.preAssignedMedallion != bundleInfo.medallion) {
            throw new Error("specified bundleInfo doesn't match pre-assigned medallion");
        }
        this._bundleInfo = { ...bundleInfo };
        this._bundleInfo.comment = this.pendingComment;
        this._builder.setTimestamp(bundleInfo.timestamp);
        this._builder.setPrevious(bundleInfo.priorTime);
        this._builder.setChainStart(bundleInfo.chainStart);
        this._builder.setMedallion(bundleInfo.medallion);
        this._builder.setComment(this._bundleInfo.comment);
        this.serialized = this._builder.serializeBinary();
        return this._bundleInfo;
    }
}
