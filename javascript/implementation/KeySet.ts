import { Database } from "./Database";
import { Container } from "./Container";
import { ScalarKey, Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, fromStorageKey } from "./utils";
import { toJson } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class KeySet extends Container {
    constructor(
        database: Database,
        address: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.KEY_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.KEY_SET);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.KEY_SET);
        }
    }

    /**
     * Adds a key to the keyset.
     * If a bundler is supplied, the function will add the entry to that bundler
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myKeySet.add("foo");
     * @param key
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created entry
     */
    async add(key: ScalarKey, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Similar to add method, but for multiple entries.
     * @param keys an iterable of keys to add to the key set
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to a Bundler object for the created entries.
     */
    async update(
        keys: Iterable<ScalarKey>,
        change?: Bundler | string
    ): Promise<Bundler> {
        let bundler: Bundler;
        if (change instanceof Bundler) {
            bundler = change;
        } else {
            bundler = new Bundler(change);
        }
        for (const key of keys) {
            await this.addEntry(key, Container.INCLUSION, bundler);
        }
        await this.database.addBundler(bundler);
        return bundler;
    }

    /**
     * Adds a deletion marker (tombstone) for a particular key in the directory.
     * The corresponding value will be seen to be unset in the data model.
     * @param key
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async delete(key: ScalarKey, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * Function to iterate over the contents of the key set.
     * @param asOf
     * @returns an async iterator across everything in the key set, with values returned as pairs of Key, Key
     */
    entries(
        asOf?: AsOf
    ): AsyncGenerator<[ScalarKey, ScalarKey], void, unknown> {
        const thisSet = this;
        return (async function* () {
            const entries = await thisSet.database.store.getKeyedEntries(
                thisSet.address,
                asOf
            );
            for (const [key, entry] of entries) {
                const storageKey = <ScalarKey>entry.storageKey;
                yield [storageKey, storageKey];
            }
        })();
    }

    /**
     * Returns whether the key set has a key or not.
     * @param key
     * @param asOf
     * @returns true if the key set has the key, false if not.
     */
    async has(key: ScalarKey, asOf?: AsOf): Promise<boolean> {
        const result = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf
        );
        if (result !== undefined && result.deletion) {
            return false;
        }
        return result !== undefined;
    }

    /**
     *
     * @param args Optional arguments, including:
     * @argument toTime Optional time to reset to. If absent, the container will be cleared.
     * @argument bundlerOrComment Optional bundler or comment to add this change to
     * @argument skipProperties If true, do not reset properties of this container. By default,
     * all properties associated with this container will be reset to the time specified in toTime.
     * @argument recurse NOTE: THIS FLAG IS IGNORED. Recursive reset for Inclusion-based containers
     * is not yet implemented, but this arg needs to be accepted for other containers recursively
     * resetting this one.
     * @argument seen NOTE: THIS FLAG IS IGNORED. Recursive reset for Inclusion-based containers
     * is not yet implemented, but this arg needs to be accepted for other containers recursively
     * resetting this one.
     */
    async reset(args?: {
        toTime?: AsOf;
        bundlerOrComment?: Bundler | string;
        skipProperties?: boolean;
        recurse?: boolean;
        seen?: Set<string>;
    }): Promise<void> {
        const toTime = args?.toTime;
        const bundlerOrComment = args?.bundlerOrComment;
        const skipProperties = args?.skipProperties;
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, bundler);
        } else {
            const union = new Set<ScalarKey>();
            const entriesThen = await this.database.store.getKeyedEntries(
                this.address,
                toTime
            );
            const entriesNow = await this.database.store.getKeyedEntries(
                this.address
            );

            for (const [key, entry] of entriesThen) {
                const storageKey = <ScalarKey>entry.storageKey;
                union.add(storageKey);
            }
            for (const [key, entry] of entriesNow) {
                const storageKey = <ScalarKey>entry.storageKey;
                union.add(storageKey);
            }
            for (const key of union) {
                const genericKey = fromStorageKey(key);
                const thenEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                    toTime
                );
                const nowEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey
                );
                ensure(nowEntry || thenEntry, "both then and now undefined?");
                if (!nowEntry) {
                    // This key was present then, but not now, so we need to add it back
                    ensure(thenEntry, "missing then entry?");
                    await this.addEntry(genericKey, thenEntry.value, bundler);
                } else if (!thenEntry) {
                    // This key is present now, but not then, so we need to delete it
                    ensure(nowEntry, "missing now entry?");
                    await this.addEntry(
                        genericKey,
                        Container.DELETION,
                        bundler
                    );
                } else if (nowEntry.deletion !== thenEntry.deletion) {
                    if (nowEntry.deletion) {
                        // Present then, deleted now. Need to revive.
                        await this.addEntry(
                            genericKey,
                            Container.INCLUSION,
                            bundler
                        );
                    } else if (thenEntry.deletion) {
                        // Present now, deleted then. Need to delete.
                        await this.addEntry(
                            genericKey,
                            Container.DELETION,
                            bundler
                        );
                    }
                } else {
                    ensure(
                        nowEntry.deletion === thenEntry.deletion,
                        "last case should be same entry"
                    );
                }
            }
        }
        if (!skipProperties) {
            await this.database.resetContainerProperties(this, toTime, bundler);
        }
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }

    /**
     * Returns the contents of the key set as a set.
     * @param asOf
     * @returns a promise that resolves to a set with KeyTypes.
     */
    async toSet(asOf?: AsOf): Promise<Set<ScalarKey>> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf
        );
        const resultSet = new Set<ScalarKey>();
        for (const [key, entry] of entries) {
            const storageKey = <ScalarKey>entry.storageKey;
            resultSet.add(storageKey);
        }
        return resultSet;
    }

    /**
     * How many entries are in the key set.
     * @param asOf
     * @returns a promise that resolves to a number.
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf
        );
        return entries.size;
    }

    /**
     * Generates a JSON representation of the data in the key set.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string> {
        //TODO(https://github.com/google/gink/issues/62): add indentation
        ensure(indent === false, "indent not implemented");
        if (seen === undefined) seen = new Set();
        const mySig = muidToString(this.address);
        if (seen.has(mySig)) return "null";
        seen.add(mySig);
        const asSet = await this.toSet(asOf);
        let returning = "[";
        let first = true;
        for (const key of asSet) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            // returning += `"${key}"`;
            returning += await toJson(
                key,
                indent === false ? false : +indent + 1,
                asOf,
                seen
            );
        }
        returning += "]";
        return returning;
    }
}
