import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, AsOf } from "./typedefs"
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { toJson, interpret } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class KeySet extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.KEY_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.KEY_SET)
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.KEY_SET)
        }
    }

    /**
     * Adds a key to the keyset.
     * If a bundler is supplied, the function will add the entry to that bundler 
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myKeySet.add("foo");
     * @param key 
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created entry  
     */
    async add(key: KeyType, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change)
    }

    // clear - need to add but not sure how yet

    async delete(key: KeyType, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change)
    }

    async entries(asOf?: AsOf): Promise<Set<KeyType>> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        const resultSet = new Set<KeyType>
        for (const [key, entry] of entries) {
            resultSet.add(key);
        }
        return resultSet;
    }

    async has(key: KeyType, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        return result != undefined
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }
}

