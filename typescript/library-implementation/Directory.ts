import { Container } from "./Container";
import { Value, Muid, KeyType, AsOf } from "./typedefs";
import { Container as ContainerBuilder } from "container_pb";
import { ChangeSet } from "./ChangeSet";
import { ensure, muidToString } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { toJson, interpret } from "./factories";
import { Behavior } from "behavior_pb";

export class Directory extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address.timestamp !== 0) {
            ensure(this.containerBuilder.getBehavior() == Behavior.SCHEMA);
        } else {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset == Behavior.SCHEMA);
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
    async get(key: KeyType, asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.ginkInstance.store.getEntry(this.address, key, asOf);
        return interpret(entry, this.ginkInstance);
    }

    async size(asOf: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    async has(key: KeyType, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntry(this.address, key, asOf);
        return result[1] !== undefined;
    }

    async toMap(asOf?: AsOf): Promise<Map<KeyType, Value|Container>> {
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
     * @param seen (internal use only! prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number|boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
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
            returning += `"${key}":`
            returning += await toJson(value, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "}";
        return returning;
    }
}
