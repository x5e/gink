import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Value, Muid, AsOf } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior } from "gink/protoc.out/behavior_pb";

export class Box extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address.timestamp !== 0) {
            ensure(this.containerBuilder.getBehavior() == Behavior.BOX);
        } else {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset == Behavior.BOX);
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
    async get(asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.ginkInstance.store.getEntry(this.address, undefined, asOf);
        return interpret(entry, this.ginkInstance);
    }

    /**
     * 
     * @param asOf Historical time to look
     * @returns 0 or 1 depending on whether or not there's something in the box.
     */
    async size(asOf?: AsOf): Promise<number> {
        const entry = await this.ginkInstance.store.getEntry(this.address, undefined, asOf);    
        return +!(entry === undefined || entry.deleting)
    }

    async isEmpty(asOf?: AsOf): Promise<boolean> {
        const entry = await this.ginkInstance.store.getEntry(this.address, undefined, asOf);    
        return (entry === undefined || entry.deleting)
    }

    /**
     * Generates a JSON representation of the data in the box (the box itself is transparent).
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        if (seen === undefined) seen = new Set();
        const contents = await this.get(asOf);
        if (contents === undefined) return "null";
        return await toJson(contents, indent, asOf, seen);
    }

}
