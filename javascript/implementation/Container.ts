import { Bundler } from "./Bundler";
import { Value, ScalarKey, Muid, AsOf } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey, strToMuid } from "./utils";
import { Deletion } from "./Deletion";
import { Inclusion } from "./Inclusion";
import { Database } from "./Database";
import {
    EntryBuilder,
    ChangeBuilder,
    Behavior,
    ClearanceBuilder,
} from "./builders";
import { PairBuilder } from "./builders";
import { Addressable } from "./Addressable";
import { bundlePropertyEntry } from "./store_utils";

export class Container extends Addressable {
    protected static readonly DELETION = new Deletion();
    protected static readonly INCLUSION = new Inclusion();

    protected constructor(
        readonly database: Database,
        address: Muid,
        readonly behavior: Behavior
    ) {
        super(address);
    }

    public toString(): string {
        const address = this.address;
        return `Container(${address.timestamp},${address.medallion},${address.offset})`;
    }

    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string> {
        return Promise.resolve(`"${this.toString()}"`);
    }

    public async setName(
        name: string,
        bundlerOrComment?: Bundler | string
    ): Promise<Muid> {
        return await this.database
            .getGlobalProperty()
            .set(this, name, bundlerOrComment);
    }

    public async getName(asOf?: AsOf) {
        return await this.database.getGlobalProperty().get(this, asOf);
    }

    public async clear(
        purge?: boolean,
        bundlerOrComment?: Bundler | string
    ): Promise<Muid> {
        if (!(purge === undefined || purge === true || purge === false)) {
            throw new Error(
                "first parameter to clear must be boolean (true => purge)"
            );
        }
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        const clearanceBuilder = new ClearanceBuilder();
        clearanceBuilder.setPurge(purge || false);
        clearanceBuilder.setContainer(
            muidToBuilder(this.address, bundler.medallion)
        );
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setClearance(clearanceBuilder);
        const address = bundler.addChange(changeBuilder);
        if (immediate) {
            await this.database.addBundler(bundler);
        }
        return address;
    }

    /**
     * Reset this Container to a previous time. If no time is specified, the container will
     * be cleared.
     * @param args Optional arguments, including:
     * @argument toTime Optional time to reset to. If absent, the container will be cleared.
     * @argument bundlerOrComment Bundler to add this change to, string to add a comment to a
     * new bundle, or empty to apply immediately.
     * @argument skipProperties If true, do not reset properties of this container. By default,
     * all properties associated with this container will be reset to the time specified in toTime.
     * @argument recurse Recursively reset all child containers held by this container at reset time?
     * @argument seen A Set of seen container muids (in string form) to prevent infinite recursion.
     * Primarily for internal use, but could be used to prevent specific containers from being reset.
     */
    public async reset(args?: {
        toTime?: AsOf;
        bundlerOrComment?: Bundler | string;
        skipProperties?: boolean;
        recurse?: boolean;
        seen?: Set<string>;
    }): Promise<void> {
        throw new Error("Child class should have implemented this method.");
    }

    public async size(): Promise<number> {
        throw new Error("Child class should have implemented this method.");
    }

    /**
     *
     * @param key If absent, create a boxed entry, if KeyType, set a key in entry, if true, create a list entry
     * @param value What the container ought to contain (an immediate Value, a reference, or a deletion)
     * @param bundlerOrComment Bundler to add this change to, or empty to apply immediately.
     * @returns a promise the resolves to the muid of the change
     */
    protected addEntry(
        key?:
            | ScalarKey
            | Addressable
            | [Addressable, Addressable]
            | Muid
            | [Muid, Muid],
        value?: Value | Deletion | Inclusion,
        bundlerOrComment?: Bundler | string
    ): Promise<Muid> {
        let immediate = false;
        let bundler: Bundler;

        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }

        const entryBuilder = new EntryBuilder();
        if (this.address) {
            entryBuilder.setContainer(
                muidToBuilder(this.address, bundler.medallion)
            );
        }

        entryBuilder.setBehavior(this.behavior);

        if (
            typeof key === "number" ||
            typeof key === "string" ||
            key instanceof Uint8Array
        ) {
            entryBuilder.setKey(wrapKey(key));
        } else if (Array.isArray(key)) {
            const pair = new PairBuilder();
            let key1 = key[0];
            let key2 = key[1];
            if ("address" in key[0] && "address" in key[1]) {
                key1 = key[0].address;
                key2 = key[1].address;
            }
            pair.setLeft(muidToBuilder(key1));
            pair.setRite(muidToBuilder(key2));
            entryBuilder.setPair(pair);
        } else if (key instanceof Addressable) {
            entryBuilder.setDescribing(muidToBuilder(key.address));
        } else if (key && "timestamp" in key) {
            entryBuilder.setDescribing(muidToBuilder(key));
        }

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Addressable) {
                entryBuilder.setPointee(
                    muidToBuilder(value.address, bundler.medallion)
                );
            } else if (value instanceof Deletion) {
                entryBuilder.setDeletion(true);
            } else if (value instanceof Inclusion) {
            } else {
                entryBuilder.setValue(wrapValue(value));
            }
        }
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setEntry(entryBuilder);
        // This change should be encrypted if the database has a symmetricKey
        const address = bundler.addChange(
            changeBuilder,
            !!this.database.symmetricKey
        );
        if (immediate) {
            return this.database.addBundler(bundler).then((_) => address);
        }
        return Promise.resolve(address);
    }

    /**
     * Reset the properties associated with this container to a previous time.
     * @param toTime optional timestamp to reset to. If not provided, the properties will be deleted.
     * @param bundlerOrComment optional bundler to add this change to, or a string to add a comment to a new bundle.
     */
    public async resetProperties(
        toTime?: AsOf,
        bundlerOrComment?: Bundler | string
    ): Promise<void> {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }

        const propertiesNow =
            await this.database.store.getContainerProperties(this);
        if (!toTime) {
            for (const [key, _] of propertiesNow.entries()) {
                const propertyMuid = strToMuid(key);
                // Omitting value parameter creates a deleting entry
                bundlePropertyEntry(bundler, propertyMuid, this.address);
            }
        } else {
            const propertiesThen =
                await this.database.store.getContainerProperties(this, toTime);

            for (const [key, value] of propertiesThen.entries()) {
                if (value !== propertiesNow.get(key)) {
                    const propertyMuid = strToMuid(key);
                    bundlePropertyEntry(
                        bundler,
                        propertyMuid,
                        this.address,
                        value
                    );
                }
                // Remove from propertiesNow so we can delete the rest
                // after this iteration
                propertiesNow.delete(key);
            }
            // Now loop through the remaining propertiesNow and delete them
            for (const [key, _] of propertiesNow.entries()) {
                const propertyMuid = strToMuid(key);
                // Omitting value parameter creates a deleting entry
                bundlePropertyEntry(bundler, propertyMuid, this.address);
            }
        }
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }
}
