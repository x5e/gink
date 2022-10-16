import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Value, Muid } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure } from "./utils";
import { convertEntryBytes } from "./factories";

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
    async set(value: Value | Container, changeSet?: ChangeSet): Promise<Muid> {
        return this.addEntry(undefined, value, changeSet);
    }

    /**
     * Adds a deletion marker (tombstone) to the box, effectively clearing it.
     * The corresponding value will be seen to be unset in the data model.
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async clear(changeSet?: ChangeSet): Promise<Muid> {
        return this.addEntry(undefined, Container.DELETION, changeSet);
    }

    /**
    * Returns a promise that resolves to the most recent value put in the box, or undefined.
    * @returns undefined, a basic value, or a container
    */
    async get(asOf:number = Infinity): Promise<Container | Value | undefined> {
        await this.initialized;
        const result = await this.ginkInstance.store.getEntry(this.address, undefined, asOf);
        if (result === undefined) {
            return undefined;
        }
        const [entryAddress, entryBytes] = result;
        return await convertEntryBytes(this.ginkInstance, entryBytes, entryAddress);
    }

    async size(asOf: number=Infinity): Promise<number> {
        return +!((await this.get(asOf)) === undefined);
    }

}
