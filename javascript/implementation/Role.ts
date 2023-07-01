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

    /**
     * Includes a Muid or Container in the role.
     * @param key either a container or a Muid to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(key: Muid|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Excludes a Muid or Container from the role.
     * @param key either a Muid or container to exclude
     * @param change an optional bundler to put this in
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(key: Muid|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * The number of items in the role.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    /**
     * Whether or not the given key is included in the role.
     * @param key either a Muid or container to check if it is included
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean stating whether the key is included
     */
    async contains(key: Muid|Container, asOf?: AsOf): Promise<boolean> {
        if ("address" in key) {
            key = key.address;
        }
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return Boolean(entry);
    }

    /**
     * Function to iterate over the contents of the role.
     * @param asOf optional timestamp to look back to
     * @returns an async iterator across everything in the role, with values returned as MuidTuples
     */
    get_member_ids(asOf?: AsOf): AsyncGenerator<MuidTuple|KeyType|[], void, unknown> {
        const thisSet = this;
        return (async function*(){
            const entries = await thisSet.ginkInstance.store.getKeyedEntries(thisSet.address, asOf);
            for (const [key, entry] of entries) {
                if (!(entry.effectiveKey instanceof Array)) {
                    yield entry.effectiveKey;
                }
            }
        })();
    }

    /**
     * Returns the content of the role as a set.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a set of Muids
     */
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

    /**
     * Generates a JSON representation of the data in the role.
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
        const asSet = await this.toSet(asOf);
        let returning = "[";
        let first = true;
        for (const key of asSet) {
            if (first) {
                first = false;
            }   else {
                returning += ",";
            }
            returning += await toJson(muidToString(key), indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "]";
        return returning;
    }
}
