import { Value, ScalarKey, Muid, AsOf, Meta, Bundler } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey } from "./utils";
import { Deletion } from "./Deletion";
import { Inclusion } from "./Inclusion";
import { Database } from "./Database";
import {
    EntryBuilder,
    ChangeBuilder,
    Behavior,
    ClearanceBuilder,
    ContainerBuilder,
} from "./builders";
import { PairBuilder } from "./builders";
import { Addressable } from "./Addressable";
import { interpret } from "./factories";

export abstract class Container extends Addressable {
    protected static readonly DELETION = new Deletion();
    protected static readonly INCLUSION = new Inclusion();
    protected static globalPropertyMuid = {
        medallion: -1,
        timestamp: -1,
        offset: Behavior.PROPERTY,
    }

    protected constructor(
        readonly database: Database,
        address: Muid,
        readonly behavior: Behavior
    ) {
        super(address);
    }

    protected static async addContainer({database, behavior, meta}:
        {database: Database, behavior: Behavior, meta?: Meta}): Promise<Muid> {
            const bundler = await database.startBundle(meta);
            const containerBuilder = new ContainerBuilder();
            containerBuilder.setBehavior(behavior);
            const muid = bundler.addChange(new ChangeBuilder().setContainer(containerBuilder));
            if (!meta?.bundler) {
                await bundler.commit();
            }
            return muid;
    }

    abstract toJson(
        indent: number | boolean,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string>;

    public async setName(name: string, meta?: Meta): Promise<Muid> {
        return await this.addEntry(this, name, meta, Container.globalPropertyMuid)
    }

    public async getName(asOf?: AsOf): Promise<string|undefined> {
        const entry = await this.database.store.getEntryByKey(
            Container.globalPropertyMuid,
            this.address,
            asOf
        );
        const result = await interpret(entry, this.database);
        return <string|undefined> result;
    }

    public async clear(purge?: boolean, meta?: Meta): Promise<Muid> {
        const bundler = await this.database.startBundle(meta);
        const clearanceBuilder = new ClearanceBuilder();
        clearanceBuilder.setPurge(purge || false);
        clearanceBuilder.setContainer(
            muidToBuilder(this.address, bundler.medallion)
        );
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setClearance(clearanceBuilder);
        const address = bundler.addChange(changeBuilder);
        if (! meta?.bundler) {
            await bundler.commit();
        }
        return address;
    }

    /**
     * Reset this Container to a previous time. If no time is specified, the container will
     * be cleared.
     * @argument toTime Optional time to reset to. If absent, the container will be cleared.
     * @argument recurse Recursively reset all child containers held by this container at reset time?
     * @argument meta Metadata to be used in the reset.
     */
    public abstract reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void>;

    public abstract size(asOf?: AsOf): Promise<number>;


    protected addEntry(
        key?:
            | ScalarKey
            | Addressable
            | [Addressable, Addressable]
            | Muid
            | [Muid, Muid],
        value?: Value | Deletion | Inclusion,
        meta?: Meta,
        onContainer?: Muid,
    ): Promise<Muid> {
        return this.database.startBundle(meta).then(bundler => {
            const entryBuilder = new EntryBuilder();
            if (!this.address) throw new Error("unexpected");
            entryBuilder.setContainer(
                muidToBuilder(onContainer ?? this.address, bundler.medallion)
            );
            let behavior = this.behavior;
            if (onContainer) {
                if (onContainer.timestamp !== -1)
                    throw new Error("unexpected");
                behavior = onContainer.offset;
            }
            entryBuilder.setBehavior(behavior);
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
            const address = bundler.addChange(changeBuilder);
            if (! meta?.bundler) {
                return bundler.commit().then(() => address);
            }
            return address;
        });
    }
}
