import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf, Meta } from "./typedefs";
import { ensure } from "./utils";
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

    async addNumber(increment: number, meta?: Meta): Promise<Muid> {
        const value = BigInt(Math.floor(increment * 1_000_000_000));
        return this.addEntry(undefined, value, meta);
    }

    async getNumber(asOf?: AsOf): Promise<number> {
        const billionths = await this.database.store.getBillionths(this.address, asOf);
        return Number(billionths) / 1_000_000_000;
    }

    /**
     * checks to see how many things are in the box (will be either 0 or 1)
     * @param asOf Historical time to look
     * @returns 0 or 1 depending on whether there's something in the box.
     */
    async size(asOf?: AsOf): Promise<number> {
        return this.getNumber(asOf);
    }

    public async clear(purge?: boolean, meta?: Meta): Promise<Muid> {
        throw new Error("not implemented");
    }

    async reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void> {
        const bundler = await this.database.startBundle(meta);
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, { bundler });
        } else {
            /*
            const thereNow = await this.getNumber();
            const thereThen = await this.get(toTime);
            if (thereThen !== thereNow) {
                await this.set(thereThen, { bundler });
            }
            */
        }
        if (!meta?.bundler) {
            await bundler.commit();
        }
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
        _indent: number | boolean = false,
        asOf?: AsOf,
        _seen?: Set<string>,
    ): Promise<string> {
        return String(await this.getNumber(asOf));
    }
}
