import { Database } from "./Database";
import { Container } from "./Container";
import { Value, Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class Box extends Container {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.BOX);
        if (this.address.timestamp < 0) {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset === Behavior.BOX);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.BOX);
        }
    }

    /**
     * Puts a value or a reference to another container in this box.
     * If a bundler is supplied, the function will add the entry to that bundler
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await myBox.put("some value");
     * @param value
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created entry
     */
    async set(value: Value | Container, change?: Bundler | string): Promise<Muid> {
        return this.addEntry(undefined, value, change);
    }

    /**
    * Returns a promise that resolves to the most recent value put in the box, or undefined.
    * @returns undefined, a basic value, or a container
    */
    async get(asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(this.address, undefined, asOf);
        return interpret(entry, this.database);
    }

    /**
     * checks to see how many things are in the box (will be either 0 or 1)
     * @param asOf Historical time to look
     * @returns 0 or 1 depending on whether there's something in the box.
     */
    async size(asOf?: AsOf): Promise<number> {
        const entry = await this.database.store.getEntryByKey(this.address, undefined, asOf);
        return +!(entry === undefined || entry.deletion);
    }

    /**
     * checks to see if something is in the box
     * @param asOf
     * @returns true if no value or container is in the box
     */
    async isEmpty(asOf?: AsOf): Promise<boolean> {
        const entry = await this.database.store.getEntryByKey(this.address, undefined, asOf);
        return (entry === undefined || entry.deletion);
    }

    /**
     * Generates a JSON representation of the data in the box (the box itself is transparent).
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! Prevent cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        if (seen === undefined) seen = new Set();
        const contents = await this.get(asOf);
        if (contents === undefined) return "null";
        return await toJson(contents, indent, asOf, seen);
    }

}
