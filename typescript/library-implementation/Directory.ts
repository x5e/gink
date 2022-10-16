import { Container } from "./Container";
import { Value, Muid, KeyType } from "./typedefs";
import { Container as ContainerBuilder } from "container_pb";
import { ChangeSet } from "./ChangeSet";
import { ensure, muidToString } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { toJson, convertEntryBytes } from "./factories";

export class Directory extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.SCHEMA);
        }
    }

    //TODO(https://github.com/google/gink/issues/54): Implement clear().

    /**
     * Sets a key/value association in a Schema.
     * If a change set is supplied, the function will add the entry to that change set 
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a change set, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await mySchema.set("foo", "bar");
     * @param key 
     * @param value 
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created entry  
     */
    async set(key: KeyType, value: Value | Container, changeSet?: ChangeSet): Promise<Muid> {
        return await this.addEntry(key, value, changeSet);
    }

    /**
     * Adds a deletion marker (tombstone) for a particular key in the schema.
     * The corresponding value will be seen to be unset in the datamodel.
     * @param key 
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async delete(key: KeyType, changeSet?: ChangeSet): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, changeSet);
    }

    /**
    * Returns a promise that resolves to the most recent value set for the given key, or undefined.
    * @param key
    * @returns undefined, a basic value, or a container
    */
    async get(key: KeyType): Promise<Container | Value | undefined> {
        await this.initialized;
        const result = await this.ginkInstance.store.getEntry(this.address, key);
        if (result === undefined) {
            return undefined;
        }
        const [entryAddress, entryBytes] = result;
        return convertEntryBytes(this.ginkInstance, entryBytes, entryAddress);
    }

    async size(): Promise<number> {
        // There almost certainly is a more efficient implementation that doesn't require loading
        // the entire contents of the map into memory first.
        return (await this.toMap()).size;
    }

    async has(key: KeyType): Promise<boolean> {
        await this.initialized;
        const result = await this.ginkInstance.store.getEntry(this.address, key);
        return result[1] !== undefined;
    }

    async toMap(asOf: number = Infinity): Promise<Map<KeyType, any>> {
        const entries = await this.ginkInstance.store.getEntries(this.address, asOf);
        const resultMap = new Map();
        for (const [key, muid, bytes] of entries) {
            const val = await convertEntryBytes(this.ginkInstance, bytes, muid);
            if (val === undefined) {
                resultMap.delete(key);
            } else {
                resultMap.set(key, val);
            }
        }
        return resultMap;
    }

    /**
     * Generates a JSON representation of the data in the list.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number|boolean = false, asOf: number = Infinity, seen?: Set<string>): Promise<string> {
        //TODO(https://github.com/google/gink/issues/62): add indentation
        ensure(indent === false, "indent not implemented");
        if (seen === undefined) seen = new Set();
        ensure(indent === false, "indent not implemented");
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
            returning += `"${key}":`
            returning += await toJson(value, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "}";
        return returning;
    }
}
