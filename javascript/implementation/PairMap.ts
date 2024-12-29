import { Database } from "./Database";
import { Muid, Meta } from "./typedefs";
import { Behavior } from "./builders";
import { Addressable } from "./Addressable";
import { Keyed } from "./Keyed";
import { Container } from "./Container";

export class PairMap extends Keyed<[Addressable, Addressable]> {
    private constructor(database: Database, address: Muid) {
        super(database, address, Behavior.PAIR_MAP);
    }

    static get(database?: Database, muid?: Muid): PairMap {
        database = database || Database.recent;
        if (!muid) {
            muid = { timestamp: -1, medallion: -1, offset: Behavior.PAIR_MAP };
        }
        return new PairMap(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<PairMap> {
        database = database || Database.recent;
        const muid = await Container.addContainer({
            behavior: Behavior.PAIR_MAP,
            database,
            meta,
        });
        return new PairMap(database, muid);
    }
}
