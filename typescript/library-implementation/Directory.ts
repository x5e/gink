import { Container } from "./Container";
import { Basic, Muid, KeyType } from "./typedefs";
import { Container as ContainerBuilder } from "container_pb";
import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import { ensure, unwrapValue, builderToMuid } from "./utils";
import { GinkInstance } from "./GinkInstance";

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
    async set(key: KeyType, value: Basic | Container, changeSet?: ChangeSet): Promise<Muid> {
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
    async get(key: KeyType): Promise<Container | Basic | undefined> {
        return (await this.getEntry(key))[1];
    }

    async size(): Promise<number> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async has(key: KeyType): Promise<boolean> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async entries(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async keys(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async values(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async clear(changeSet?: ChangeSet): Promise<Muid> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async forEach(callBack, thisArg): Promise<void> {

    }

}