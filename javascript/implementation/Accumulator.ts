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

    async getBillionths(asOf?: AsOf): Promise<bigint> {
        return this.database.store.getBillionths(this.address, asOf);
    }

    async addBillionths(value: bigint, meta?: Meta): Promise<Muid> {
        return this.addEntry(undefined, value, meta);
    }

    async size(_asOf?: AsOf): Promise<number> {
        throw new Error("size not defined for accumulators")
    }

    public async clear(purge?: boolean, meta?: Meta): Promise<Muid> {
        throw new Error("accumulators cannot be cleared");
    }

    async reset(toTime?: AsOf, _recurse?, meta?: Meta): Promise<void> {
        let current = await this.getBillionths();
        let pastValue = 0n;
        if (toTime) {
            pastValue = await this.getBillionths(toTime);
        }
        await this.addBillionths((-1n * current) + pastValue, meta);
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
