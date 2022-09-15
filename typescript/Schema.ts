import { Container } from "./Container";
import { ChangeSet } from "./ChangeSet";
import { Basic, Address } from "./typedefs";
import { assert } from "./utils";
import { Container as ContainerMessage } from "container_pb";

export class Schema extends Container {
    

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
     async set(key: Basic, value: Basic | Container, changeSet?: ChangeSet): Promise<Address> {
        assert(this.containerMessage.getBehavior() == ContainerMessage.SCHEMA);
        return await this.addEntry(key, value, changeSet);
    }

    async delete(key: Basic, changeSet?: ChangeSet): Promise<Address> {
        const behavior = this.containerMessage.getBehavior();
        assert(behavior == ContainerMessage.SCHEMA || behavior == ContainerMessage.SET);
        return await this.addEntry(key, Container.DELETION, changeSet);
    }
}
