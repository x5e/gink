import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Basic, Muid } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure } from "./utils";

export class Box extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.BOX);
        }
    }
    /**
     * Puts a value or a reference to another container in this box. 
     * If a change set is supplied, the function will add the entry to that change set 
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a change set, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myBox.put("some value");
     * @param value 
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created entry  
     */
    async set(value: Basic | Container, changeSet?: ChangeSet): Promise<Muid> {
        //TODO(TESTME)
        return await this.addEntry(undefined, value, changeSet);
    }

    /**
     * Adds a deletion marker (tombstone) to the box, effectively clearing it.
     * The corresponding value will be seen to be unset in the datamodel.
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async clear(changeSet?: ChangeSet): Promise<Muid> {
        //TODO(TESTME)
        return await this.addEntry(undefined, Container.DELETION, changeSet);
    }

    /**
    * Returns a promise that resolves to the most recent value put in the box, or undefined.
    * @returns undefined, a basic value, or a container
    */
    async get(): Promise<Container | Basic | undefined> {
        //TODO(TESTME)
        return await this.getEntry(undefined)[1];
    }

    async size(): Promise<number> {
        //TODO(TESTME)
        return +!(this.getEntry(undefined)[1] === undefined);
    }

}
