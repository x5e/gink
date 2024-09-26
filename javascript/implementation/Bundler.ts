import {
    Muid,
    BundleInfo,
    Medallion,
    Timestamp,
    BundleView,
    BundleBytes,
    KeyPair,
    Bytes,
} from "./typedefs";
import {
    BundleBuilder,
    ChangeBuilder,
    EntryBuilder,
    ContainerBuilder,
} from "./builders";
import { digest, ensure, signBundle } from "./utils";

export class Bundler implements BundleView {
    // note: this class is unit tested as part of Store.test.ts
    private bundleInfo?: BundleInfo = undefined;
    private bundleBytes?: BundleBytes = undefined;
    private bundleBuilder = new BundleBuilder();
    private countItems = 0;
    // Making this public so Database can see whether it
    // needs to encrypt the inner bundle before sealing.
    innerBundleToEncrypt?: BundleBuilder;

    constructor(
        private pendingComment?: string,
        readonly preAssignedMedallion?: Medallion
    ) {}

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
        if (!this.bundleInfo) throw new Error("Bundle not yet sealed.");
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
        return this.addChange(new ChangeBuilder().setEntry(entryBuilder));
    }

    addContainer(containerBuilder: ContainerBuilder): Muid {
        return this.addChange(
            new ChangeBuilder().setContainer(containerBuilder)
        );
    }

    /**
     *
     * @param changeBuilder a protobuf Change ready to be serialized
     * @param encrypted If true, the change will be added to the inner bundle to be encrypted.
     * Upon sealing the bundle and adding to the database, the changes will be encrypted.
     * @returns an Address who's offset is immediately available and whose medallion and
     * timestamp become defined when this Bundle is sealed.
     */
    addChange(changeBuilder: ChangeBuilder, encrypted: Boolean = false): Muid {
        this.requireNotSealed();
        const offset = ++this.countItems;
        if (encrypted && !this.innerBundleToEncrypt) {
            this.innerBundleToEncrypt = new BundleBuilder();
        }
        const bundleBuilder = encrypted
            ? this.innerBundleToEncrypt
            : this.bundleBuilder;

        bundleBuilder.getChangesList().push(changeBuilder);
        return this.createDeferredMuid(offset);
    }

    /**
     * Set the encrypted bundle bytes of the inner bundle to be encrypted.
     * Note that this should be done last, as calling this function twice will
     * overwrite the previous encrypted bytes. To add more than one encrypted
     * change, use addChange with the encrypted flag set to true.
     * @param encryptedBytes the serialized and encrypted bytes of the inner bundle
     * @param keyId the keyId of the symmetric key
     */
    setEncryptedBytes(encryptedBytes: BundleBytes, keyId: number): void {
        this.requireNotSealed();
        this.bundleBuilder.setEncrypted(encryptedBytes);
        this.bundleBuilder.setKeyId(keyId);
    }

    /**
     * Intended to be called by a Database to finalize a bundle.
     * @param bundleInfo the bundle metadata to add when serializing
     * @returns serialized
     */
    seal(
        bundleInfo: BundleInfo,
        keyPair: KeyPair,
        priorHash?: Bytes,
        identity?: string
    ): void {
        this.requireNotSealed();
        if (
            this.preAssignedMedallion &&
            this.preAssignedMedallion !== bundleInfo.medallion
        ) {
            throw new Error(
                "specified bundleInfo doesn't match pre-assigned medallion"
            );
        }
        this.bundleInfo = { ...bundleInfo };
        this.bundleInfo.comment = this.pendingComment;
        this.bundleBuilder.setComment(this.pendingComment);
        this.bundleBuilder.setTimestamp(bundleInfo.timestamp);
        this.bundleBuilder.setPrevious(bundleInfo.priorTime);
        this.bundleBuilder.setChainStart(bundleInfo.chainStart);
        this.bundleBuilder.setMedallion(bundleInfo.medallion);
        this.bundleBuilder.setComment(this.bundleInfo.comment);
        if (bundleInfo.chainStart === bundleInfo.timestamp) {
            ensure(identity, "identity required for chain-start bundles");
            this.bundleBuilder.setIdentity(identity);
            this.bundleBuilder.setVerifyKey(keyPair.publicKey);
        } else {
            ensure(priorHash && priorHash.length == 32, "need prior_hash");
            ensure(
                !identity,
                "identity not allowed for non-chain-start bundles"
            );
            this.bundleBuilder.setPriorHash(priorHash);
        }

        this.bundleBytes = signBundle(
            this.bundleBuilder.serializeBinary(),
            keyPair.secretKey
        );
        this.bundleInfo.hashCode = digest(this.bundleBytes);
    }

    private createDeferredMuid(offset: number): Muid {
        // Using an anonymous class here because I only need the interface of Address,
        // but I need some non-trivial behavior: the timestamp and possibly medallion
        // are undefined until the associated bundle is finalized, then all the
        // components of the address become well-defined.
        return new (class {
            constructor(
                private bundler: Bundler,
                readonly offset: number
            ) {}
            get medallion() {
                return this.bundler.medallion;
            }
            get timestamp() {
                return this.bundler.timestamp;
            }
        })(this, offset);
    }
}
