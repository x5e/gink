import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, AsOf } from "./typedefs"
import { Bundler } from "./Bundler";
import { ensure, muidToString, muidTupleToMuid } from "./utils";
import { interpret, toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class KeySet extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.KEY_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.KEY_SET);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.KEY_SET);
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
    async add(key: KeyType, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Similar to add method, but for multiple entries.
     * @param keys an iterable of keys to add to the key set
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to a set of Muids for the created entries.
     */
    async update(keys: Iterable<KeyType>, change?: Bundler|string): Promise<Bundler> {
        let bundler: Bundler;
        if (change instanceof Bundler) {
            bundler = change;
        } else {
            bundler = new Bundler(change);
        }
        for (const key of keys) {
            await this.addEntry(key, Container.INCLUSION, bundler);
        }
        await this.ginkInstance.addBundler(bundler);
        return bundler;
    }

    /**
     * Adds a deletion marker (tombstone) for a particular key in the directory.
     * The corresponding value will be seen to be unset in the data model.
     * @param key
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async delete(key: KeyType, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * Function to iterate over the contents of the key set.
     * @param asOf
     * @returns an async iterator across everything in the key set, with values returned as pairs of Key, Key
     */
    entries(asOf?: AsOf): AsyncGenerator<[KeyType,KeyType], void, unknown> {
        const thisSet = this;
        return (async function*(){
            const entries = await thisSet.ginkInstance.store.getKeyedEntries(thisSet.address, asOf);
            for (const [key, entry] of entries) {
                yield [key, key]
            }
        })();
    }

    /**
     * Returns whether the key set has a key or not.
     * @param key
     * @param asOf
     * @returns true if the key set has the key, false if not.
     */
    async has(key: KeyType, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (result != undefined && result.deletion) {
            return false;
        }
        return result != undefined;
    }

    /**
     * Returns the contents of the key set as a set.
     * @param asOf
     * @returns a promise that resolves to a set with KeyTypes.
     */
    async toSet(asOf?: AsOf): Promise<Set<KeyType>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const resultSet = new Set<KeyType>;
        for (const [key, entry] of entries) {
            resultSet.add(key);
        }
        return resultSet;
    }

    /**
     * How many entries are in the key set.
     * @param asOf
     * @returns a promise that resolves to a number.
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    /**
     * Generates a JSON representation of the data in the list.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
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
            }   else {
                returning += ",";
            }
            // returning += `"${key}"`;
            returning += await toJson(key, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "]";
        return returning;

    }
}
