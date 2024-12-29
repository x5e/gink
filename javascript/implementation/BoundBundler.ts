import { Muid, BundleInfo, Sealer, Bundler, Meta } from "./typedefs";
import { ChangeBuilder } from "./builders";

/**
 * This class is considered part of the internal interface of Gink and is not part of the API
 */
export class BoundBundler implements Bundler {
    private bundleInfo?: BundleInfo = undefined;
    private changes: ChangeBuilder[] = [];

    constructor(
        readonly medallion: number,
        readonly sealer: Sealer,
        readonly meta?: Meta,
    ) {}

    public async commit(comment?: string): Promise<BundleInfo> {
        this.requireNotSealed();
        const meta = { ...this.meta };
        if (comment) {
            meta.comment = comment;
        }
        this.bundleInfo = await this.sealer(this.changes, meta);
        return this.bundleInfo;
    }

    private requireNotSealed() {
        if (this.bundleInfo)
            throw new Error("This Bundler has already been sealed.");
    }

    /**
     *
     * @param changeBuilder a protobuf Change ready to be serialized
     * @returns an Address who's offset is immediately available and whose medallion and
     * timestamp become defined when this Bundle is sealed.
     */
    addChange(changeBuilder: ChangeBuilder): Muid {
        this.requireNotSealed();
        this.changes.push(changeBuilder);
        const offset = this.changes.length;
        // Using an anonymous class here because I only need the interface of Address,
        // but I need some non-trivial behavior:
        // The timestamp is undefined until the associated bundle is finalized, then all the
        // components of the address become well-defined.
        return new (class {
            constructor(
                private bundler: BoundBundler,
                readonly offset: number,
            ) {}
            get medallion() {
                return this.bundler.medallion;
            }
            get timestamp() {
                return this.bundler.bundleInfo?.timestamp;
            }
        })(this, offset);
    }
}
