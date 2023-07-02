import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, MuidTuple, AsOf, Entry, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, muidTupleToMuid, stringToMuid, pairKeyToArray } from "./utils";
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

    async set(key: [Muid, Muid]|[Container, Container], value: Value|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, value, change);
    }

    async get(key: [Muid, Muid]|[Container, Container], asOf?: AsOf): Promise<Value|Container> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (found && !found.deletion) return found.value;
    }

    async delete(key: [Muid, Muid]|[Container, Container], change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    async has(key: [Muid, Muid]|[Container, Container], asOf?: AsOf): Promise<boolean> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return (found && !found.deletion);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    async items(asOf?: AsOf): Promise<Map<Array<Muid>, Value>> {
        let toMap = new Map();
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        for (const [key, entry] of entries) {
            if (!entry.deletion) {
                if (typeof(entry.effectiveKey)=="string") {
                    toMap.set(pairKeyToArray(entry.effectiveKey), entry.value);
                } else {
                    throw Error(`${typeof(entry.effectiveKey)} key shouldn't be here.`)
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
            }   else {
                returning += ",";
            }
            returning += await toJson(`[${muidToString(key[0])}, ${muidToString(key[1])}]: ${value},`,
            indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "}";
        return returning;
    }
}
