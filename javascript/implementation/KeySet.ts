import { Database } from "./Database";
import { Container } from "./Container";
import { ScalarKey, Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
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
