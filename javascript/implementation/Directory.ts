import { Container } from "./Container";
import { Value, Muid, KeyType, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { toJson, interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class Directory extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.DIRECTORY);
        if (this.address.timestamp < 0) {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset == Behavior.DIRECTORY);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.DIRECTORY);
        }
    }

    //TODO(https://github.com/google/gink/issues/54): Implement clear().

    /**
     * Sets a key/value association in a directory.
     * If a bundler is supplied, the function will add the entry to that bundler
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myDirectory.set("foo", "bar");
     * @param key
     * @param value
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created entry
     */
    async set(key: KeyType, value: Value | Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, value, change);
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
    * Returns a promise that resolves to the most recent value set for the given key, or undefined.
    * @param key
     * @param asOf
    * @returns undefined, a basic value, or a container
    */
    async get(key: KeyType, asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return interpret(entry, this.ginkInstance);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    async has(key: KeyType, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (result != undefined && result.deletion) {
            return false;
        }
        return result !== undefined;
    }

    /**
     * Dumps the contents of this directory into a javascript Map; mostly useful for
     * debugging though also could be used to create a backup of a database.
     * @param asOf effective time to get the dump for, or undefined for the present
     * @returns a javascript map from keys (numbers or strings) to values or containers
     */
    async toMap(asOf?: AsOf): Promise<Map<KeyType, Value | Container>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const resultMap = new Map();
        for (const [key, entry] of entries) {
            const val = await interpret(entry, this.ginkInstance);
            resultMap.set(key, val);
        }
        return resultMap;
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
        const asMap = await this.toMap(asOf);
        let returning = "{";
        let first = true;
        for (const [key, value] of asMap.entries()) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += `"${key}":`;
            returning += await toJson(value, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "}";
        return returning;
    }
}
