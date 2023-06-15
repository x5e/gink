import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, AsOf } from "./typedefs"
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
import { toJson } from "./factories"
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
     * @param change an uptional bundler to put this in.
     * @returns a promise that resolve to a set of Muids for the created entries.
     */
    async update(keys: Iterable<KeyType>, change?: Bundler|string): Promise<Set<Muid>> {
        let bundler: Bundler;
        if (change instanceof Bundler) {
            bundler = change;
        } else {
            bundler = new Bundler(change);
        }
        const additions = new Set<Muid>;
        for (const key of keys) {
            additions.add(await this.addEntry(key, Container.INCLUSION, bundler));
        }
        await this.ginkInstance.addBundler(bundler);
        return additions;
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
     * Returns a map of [key, key] - the value is the same as the key for a set
     * @param asOf
     * @returns a promise of a map of [KeyType, KeyType]
     */
    async entries(asOf?: AsOf): Promise<Map<KeyType, KeyType>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const resultMap = new Map();
        for (const [key, entry] of entries) {
            resultMap.set(key, key);
        }
        return resultMap;
    }

    /**
     * Returns whether the key set has a key or not.
     * @param key
     * @param asOf
     * @returns true if the key set has the key, false if not.
     */
    async has(key: KeyType, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
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
     * Returns a boolean stating whether all contents of the specified set are in the key set
     * @param subset another set of KeyTypes to compare contents to
     * @returns a promise resolving to true if every element from subset are in the key set
     */
    async isSuperset(subset: Iterable<KeyType>): Promise<boolean> {
        for (const elem of subset) {
            if (!await this.has(elem)) {
                return false;
            }
        }
        return true;
    }

    /**
     * All values in either the key set or the provided iterable
     * @param iterable an iterable of KeyTypes
     * @returns a promise resolving to a set of KeyTypes
     */
    async union(iterable: Iterable<KeyType>): Promise<Set<KeyType>> {
        const _union = await this.toSet();
        for (const elem of iterable) {
            await _union.add(elem);
        }
        return _union;
    }

    /**
     * All values that are in both the key set and the provided iterable.
     * @param iterable an iterable of KeyTypes
     * @returns a promise resolving to a set of KeyTypes
     */
    async intersection(iterable: Iterable<KeyType>): Promise<Set<KeyType>> {
        const _intersection = new Set<KeyType>;
        for (const elem of iterable) {
            if (await this.has(elem)) {
                _intersection.add(elem);
            }
        }
        return _intersection;
    }

    /**
     * Values that are in either the key set or the provided iterable, not both.
     * @param iterable an iterable of KeyTypes
     * @returns a promise resolving to a set of KeyTypes
     */
    async symmetricDifference(iterable: Iterable<KeyType>): Promise<Set<KeyType>> {
        const _difference = await this.toSet();
        for (const elem of iterable) {
            if (_difference.has(elem)) {
                _difference.delete(elem);
            } else {
                _difference.add(elem);
            }
        }
        return _difference;
    }

    /**
     * Values that are in the key set, but not in the provided iterable.
     * @param iterable  an iterable of KeyTypes
     * @returns a promise resolving to a set of KeyTypes
     */
    async difference(iterable: Iterable<KeyType>): Promise<Set<KeyType>> {
        const _difference = await this.toSet();
        for (const elem of iterable) {
            _difference.delete(elem);
        }
        return _difference;
    }

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
