import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class Group extends Container {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.GROUP);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.GROUP);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.GROUP);
        }
    }

    /**
     * Includes a Muid or Container in the group.
     * @param key either a container or a Muid to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(key: Container, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Excludes a Muid or Container from the group.
     * @param key either a Muid or container to exclude
     * @param change an optional bundler to put this in
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(key: Container, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * This returns the number of inclusions only, NOT exclusions.
     * @returns how many containers are included in the group
     */
    async size(): Promise<number> {
        return (await this.includedAsArray()).length;
    }

    /**
     * Whether or not the given key is explicitly included in the group.
     * @param key either a Muid or container to check if it is included
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean stating whether the key is explicitly included
     */
    async isIncluded(key: Muid | Container, asOf?: AsOf): Promise<boolean> {
        if ("address" in key) {
            key = key.address;
        }
        const entry = await this.database.store.getEntryByKey(this.address, key, asOf);
        if (entry && !entry.deletion) {
            return true;
        }
        return false;
    }

    /**
     * Function to iterate over the containers in the group.
     * @param asOf optional timestamp to look back to
     * @returns an async iterator across all containers in the group
     */
    getMembers(asOf?: AsOf): AsyncGenerator<Container, void, unknown> {
        const thisGroup = this;
        let container;
        return (async function* () {
            const entries = await thisGroup.database.store.getKeyedEntries(thisGroup.address, asOf);
            for (const [key, entry] of entries) {
                container = await interpret(entry, thisGroup.database);
                if ("behavior" in container) {
                    yield container;
                }
            }
        })();
    }

    /**
     * Dumps the contents of this group to a javascript array.Only includes explicitly included members.
     * useful for debugging and could also be used to export data by walking the tree
     * @param asOf effective time to get the dump for: leave undefined to get data as of the present
     * @returns an array containing Values (e.g. numbers, strings) and Containers (e.g. other Lists, Boxes, Directories)
     */
    async includedAsArray(asOf?: AsOf): Promise<(Container)[]> {
        const thisList = this;
        let toArray: Array<Container> = [];
        let container;
        const entries = await thisList.database.store.getKeyedEntries(thisList.address, asOf);
        for (const [key, entry] of entries) {
            container = await interpret(entry, thisList.database);
            if ("behavior" in container) {
                toArray.push(container);
            } else {
                throw Error("All entries should be containers - something is broken");
            }
        }
        return toArray;
    }

    /**
     * Generates a JSON representation of the data in the group.
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
        const asArray = await this.includedAsArray(asOf);
        let returning = "[";
        let first = true;
        for (const container of asArray) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += await toJson(container, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "]";
        return returning;
    }
}
