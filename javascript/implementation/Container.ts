import { Bundler } from "./Bundler";
import { Value, ScalarKey, Muid, AsOf } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey } from "./utils";
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
        key?: ScalarKey | Addressable | [Addressable, Addressable],
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
            pair.setLeft(muidToBuilder(key[0].address));
            pair.setRite(muidToBuilder(key[1].address));
            entryBuilder.setPair(pair);
        } else if (key instanceof Addressable) {
            entryBuilder.setDescribing(muidToBuilder(key.address));
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
        const address = bundler.addChange(changeBuilder);
        if (immediate) {
            return this.database.addBundler(bundler).then((_) => address);
        }
        return Promise.resolve(address);
    }
}
