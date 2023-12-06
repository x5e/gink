import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Muid, AsOf, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, stringMuidToHex, muidToString, pairKeyToArray } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class PairMap extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PAIR_MAP);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.PAIR_MAP);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.PAIR_MAP);
        }
    }

    /**
     * Sets a key/value association in a pair map.
     * If a bundler is supplied, the function will add the entry to that bundler
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myPairMap.set([box1, box2], "bar");
     * @param key array of 2 muids or containers (pair)
     * @param value
     * @param change an optional bundler to put this change in
     * @returns a promise that resolves to the address (Muid) of the newly created entry
     */
    async set(key: [Muid | Container, Muid | Container], value: Value | Container, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, value, change);
    }

    /**
     * Gets the value associated with the provided key.
     * @param key array of 2 muids or containers (pair)
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the value or container associated with the key.
     */
    async get(key: [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Value | Container> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (found && !found.deletion) return found.value;
    }

    /**
     * Deletes a key, value pair from the Pair Map.
     * @param key array of 2 muids or containers (pair)
     * @param change an optional bundler to put this change in
     * @returns a promise that resolves to the address (Muid) of the change.
     */
    async delete(key: [Muid | Container, Muid | Container], change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * States whether the key is in the pair map or not.
     * @param key array of 2 muids or containers (pair)
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean - true if key is in the pair map
     */
    async has(key: [Muid | Container, Muid | Container], asOf?: AsOf): Promise<boolean> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return (found && !found.deletion);
    }

    /**
     * The number of entries in the pair map.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    /**
     * Puts all entries in the pair map into a javascript map.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a javascript map of [Muid, Muid] -> value
     */
    async items(asOf?: AsOf): Promise<Map<Array<Muid>, Value>> {
        let toMap = new Map();
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        for (const [key, entry] of entries) {
            if (!entry.deletion) {
                if (typeof (entry.effectiveKey) == "string") {
                    toMap.set(pairKeyToArray(entry.effectiveKey), entry.value);
                } else {
                    throw Error(`${typeof (entry.effectiveKey)} key shouldn't be here.`);
                }
            }
        }
        return toMap;
    }

    /**
     * Generates a JSON representation of the data in the pair map.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print (not yet implemented)
     * @param asOf optional timestamp to look back to
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
        const asMap = await this.items(asOf);
        let returning = "{";
        let first = true;
        for (const [key, value] of asMap) {
            if (first) {
                first = false;
            } else {
                returning += ", ";
            }
            returning += `["${stringMuidToHex(muidToString(key[0]))}", "${stringMuidToHex(muidToString(key[1]))}"]:`;
            returning += await toJson(value, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "}";
        return returning;
    }
}
