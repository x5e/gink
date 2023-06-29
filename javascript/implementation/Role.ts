import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, MuidTuple, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, muidTupleToMuid } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class Role extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.ROLE);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.ROLE);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.ROLE);
        }
    }

    async include(key: Muid|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    async exclude(key: Muid|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    async contains(key: Muid|Container, asOf?: AsOf): Promise<boolean> {
        if ("address" in key) {
            key = key.address;
        }
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return Boolean(entry);
    }

    get_member_ids(asOf?: AsOf): AsyncGenerator<MuidTuple|KeyType|[], void, unknown> {
        const thisSet = this;
        return (async function*(){
            const entries = await thisSet.ginkInstance.store.getKeyedEntries(thisSet.address, asOf);
            for (const [key, entry] of entries) {
                yield entry.effectiveKey;
            }
        })();
    }

    async toSet(asOf?: AsOf): Promise<Set<Muid>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const resultSet = new Set<Muid>();
        for (const [key, entry] of entries) {
            if (typeof (entry.effectiveKey) == "object" && !(entry.effectiveKey instanceof Uint8Array) && !(entry.effectiveKey instanceof Array)) {
                resultSet.add(muidTupleToMuid(entry.effectiveKey));
            }
        }
        return resultSet;
    }

    // async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
    //     //TODO(https://github.com/google/gink/issues/62): add indentation
    //     ensure(indent === false, "indent not implemented");
    //     if (seen === undefined) seen = new Set();
    //     const mySig = muidToString(this.address);
    //     if (seen.has(mySig)) return "null";
    //     seen.add(mySig);
    //     const asSet = await this.toSet(asOf);
    //     let returning = "[";
    //     let first = true;
    //     for (const key of asSet) {
    //         if (first) {
    //             first = false;
    //         }   else {
    //             returning += ",";
    //         }
    //         // returning += `"${key}"`;
    //         returning += await toJson(key, indent === false ? false : +indent + 1, asOf, seen);
    //     }
    //     returning += "]";
    //     return returning;
    // }
}
