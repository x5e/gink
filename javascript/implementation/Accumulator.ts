import { Database } from "./Database";
import { Container } from "./Container";
import { Value, Muid, AsOf, Meta } from "./typedefs";
import { ensure, muidToString } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior } from "./builders";

export class Accumulator extends Container {
    private constructor(database: Database, address: Muid) {
        super(database, address, Behavior.ACCUMULATOR);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.ACCUMULATOR);
        }
    }

    static get(database?: Database, muid?: Muid): Accumulator {
        if (!muid) {
            muid = { timestamp: -1, medallion: -1, offset: Behavior.ACCUMULATOR };
        }
        database = database || Database.recent;
        return new Accumulator(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Accumulator> {
        database = database || Database.recent;
        const muid = await Container.addContainer({
            behavior: Behavior.ACCUMULATOR,
            database,
            meta,
        });
        return new Accumulator(database, muid);
    }

    async set(value: Value | Container, meta?: Meta): Promise<Muid> {
        return this.addEntry(undefined, value, meta);
    }

    async get(asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            undefined,
            asOf,
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
            asOf,
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
            this.clear(false, { bundler });
        } else {
            const thereNow = await this.get();
            const thereThen = await this.get(toTime);
            if (thereThen !== thereNow) {
                await this.set(thereThen, { bundler });
            }
            if (
                recurse &&
                thereThen instanceof Container &&
                !recurse.has(muidToString(thereThen.address))
            ) {
                await thereThen.reset(toTime, recurse, { bundler });
            }
        }
        if (!meta?.bundler) {
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
            asOf,
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
        seen?: Set<string>,
    ): Promise<string> {
        if (seen === undefined) seen = new Set();
        const contents = await this.get(asOf);
        if (contents === undefined) return "[null]";
        return "[" + (await toJson(contents, indent, asOf, seen)) + "]";
    }
}
