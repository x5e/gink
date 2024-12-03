import { Database } from "./Database";
import { Container } from "./Container";
import { Value, Muid, AsOf, Meta } from "./typedefs";
import { ensure, muidToString } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior } from "./builders";

export class Box extends Container {
    private constructor(
        database: Database,
        address: Muid
    ) {
        super(database, address, Behavior.BOX);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.BOX);
        }
    }

    static get(database?: Database, muid?: Muid): Box {
        if (! muid) {
            muid = {timestamp: -1, medallion: -1, offset: Behavior.BOX}
        }
        database = database || Database.recent;
        return new Box(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Box> {
        database = database || Database.recent;
        const muid = await Container.addContainer({behavior: Behavior.BOX, database, meta});
        return new Box(database, muid);
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
    async set(
        value: Value | Container,
        meta?: Meta
    ): Promise<Muid> {
        return this.addEntry(undefined, value, meta);
    }

    /**
     * Returns a promise that resolves to the most recent value put in the box, or undefined.
     * @returns undefined, a basic value, or a container
     */
    async get(asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            undefined,
            asOf
        );
        return interpret(entry, this.database);
    }

    /**
     * checks to see how many things are in the box (will be either 0 or 1)
     * @param asOf Historical time to look
     * @returns 0 or 1 depending on whether there's something in the box.
     */
    async size(asOf?: AsOf): Promise<number> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            undefined,
            asOf
        );
        return +!(entry === undefined || entry.deletion);
    }

    async reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void> {
        if (recurse === true) {
            recurse = new Set();
        }
        if (recurse instanceof Set) {
            recurse.add(muidToString(this.address));
        }
        const bundler = await this.database.startBundle(meta);
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, {bundler});
        } else {
            const thereNow = await this.get();
            const thereThen = await this.get(toTime);
            if (thereThen !== thereNow) {
                await this.set(thereThen, {bundler});
            }
            if (
                recurse &&
                thereThen instanceof Container &&
                !recurse.has(muidToString(thereThen.address))
            ) {
                await thereThen.reset(toTime, recurse,{bundler},);
            }
        }
        if (! meta?.bundler) {
            await bundler.commit();
        }
    }

    /**
     * checks to see if something is in the box
     * @param asOf
     * @returns true if no value or container is in the box
     */
    async isEmpty(asOf?: AsOf): Promise<boolean> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            undefined,
            asOf
        );
        return entry === undefined || entry.deletion;
    }

    /**
     * Generates a JSON representation of the data in the box (the box itself is transparent).
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! Prevent cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string> {
        if (seen === undefined) seen = new Set();
        const contents = await this.get(asOf);
        if (contents === undefined) return "null";
        return await toJson(contents, indent, asOf, seen);
    }
}
