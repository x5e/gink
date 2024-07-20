import { Muid, BundleInfo, Medallion, Timestamp, BundleView, BundleBytes, KeyPair } from "./typedefs";
import { BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder, HeaderBuilder } from "./builders";
import { ensure } from "./utils";
import { sign } from 'tweetnacl';

export class Bundler implements BundleView {
    // note: this class is unit tested as part of Store.test.ts
    private bundleInfo?: BundleInfo = undefined;
    private bundleBytes?: BundleBytes = undefined;
    private bundleBuilder = new BundleBuilder();
    private countItems = 0;

    constructor(private pendingComment?: string, readonly preAssignedMedallion?: Medallion) {
    }

    private requireNotSealed() {
        if (this.bundleInfo)
            throw new Error("This Bundler has already been sealed.");
    }

    get info(): BundleInfo {
        return ensure(this.bundleInfo, "not yet sealed");
    }

    get bytes(): BundleBytes {
        return ensure(this.bundleBytes, "not yet sealed!");
    }

    get builder(): BundleBuilder {
        if (!this.bundleInfo)
            throw new Error("Bundle not yet sealed.");
        return this.bundleBuilder;
    }

    set comment(value) {
        this.requireNotSealed();
        this.pendingComment = value;
    }

    get comment(): string | undefined {
        return this.pendingComment || this.bundleInfo?.comment;
    }

    get medallion(): Medallion | undefined {
        return this.preAssignedMedallion || this.bundleInfo?.medallion;
    }

    get timestamp(): Timestamp | undefined {
        return this.bundleInfo?.timestamp;
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
        const map = this.bundleBuilder.getChangesMap();
        map.delete(address.offset);
    }


    /**
     * Intended to be called by a Database to finalize a bundle.
     * @param bundleInfo the bundle metadata to add when serializing
     * @returns serialized
     */
    seal(bundleInfo: BundleInfo, keyPair: KeyPair): void {
        this.requireNotSealed();
        if (this.preAssignedMedallion && this.preAssignedMedallion !== bundleInfo.medallion) {
            throw new Error("specified bundleInfo doesn't match pre-assigned medallion");
        }
        this.bundleInfo = { ...bundleInfo };
        this.bundleInfo.comment = this.pendingComment;
        const headerBuilder = new HeaderBuilder();
        headerBuilder.setComment(this.pendingComment);
        headerBuilder.setTimestamp(bundleInfo.timestamp);
        headerBuilder.setPrevious(bundleInfo.priorTime);
        headerBuilder.setChainStart(bundleInfo.chainStart);
        headerBuilder.setMedallion(bundleInfo.medallion);
        headerBuilder.setComment(this.bundleInfo.comment);
        this.bundleBuilder.setHeader(headerBuilder);
        if (bundleInfo.chainStart === bundleInfo.timestamp) {
            this.bundleBuilder.setVerifyKey(keyPair.publicKey);
        }
        this.bundleBytes = sign(this.bundleBuilder.serializeBinary(), keyPair.secretKey);
    }
}
