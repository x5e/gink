import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, } from "./utils";
import { Behavior, ContainerBuilder } from "./builders";

export class PairMap extends Container {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.PAIR_MAP);
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
    async get(key: [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Value | Container | undefined> {

        const aKey: [Muid, Muid] = [
            key[0] instanceof Container ? key[0].address : key[0],
            key[1] instanceof Container ? key[1].address : key[1],
         ]
        const found = await this.database.store.getEntryByKey(this.address, aKey, asOf);
        if (found && !found.deletion)
            return found.value;
        return undefined;
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
        const value = await this.get(key, asOf);
        return value !== undefined;
    }

    /**
     * The number of entries in the pair map.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }

    async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        return "null";
    }
}
