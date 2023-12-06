import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, stringToMuid } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class PairSet extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PAIR_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.PAIR_SET);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.PAIR_SET);
        }
    }

    /**
     * Includes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(key: [Muid | Container, Muid | Container], change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Excludes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(key: [Muid | Container, Muid | Container], change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * If the pair set has a key or not.
     * @param key array of 2 muids or containers
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean, true if the key is included, false if not
     */
    async contains(key: [Muid | Container, Muid | Container], asOf?: AsOf): Promise<boolean> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (found && found.deletion) return false;
        return Boolean(found);
    }

    /**
     * The number of items in the pair set.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    /**
     * All of the pairs in the Pair Set as a set
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a set of pairs [Muid, Muid]
     */
    async get_pairs(asOf?: AsOf): Promise<Set<Array<Muid>>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const toSet = new Set<Array<Muid>>();
        for (const [key, entry] of entries) {
            if (!entry.deletion) {
                if (typeof (entry.effectiveKey) == "string") {
                    const pair = entry.effectiveKey.split("-");
                    toSet.add([stringToMuid(pair[0]), stringToMuid(pair[1])]);
                }
            }
        }
        return toSet;
    }

    /**
     * Generates a JSON representation of the data in the pair set.
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
        const asSet = await this.get_pairs(asOf);
        let returning = "[";
        let first = true;
        for (const key of asSet) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += await toJson(`[${muidToString(key[0])}, ${muidToString(key[1])}]`,
                indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "]";
        return returning;
    }
}
