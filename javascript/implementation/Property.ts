import { Muid, Meta } from "./typedefs";
import { Database } from "./Database";
import { Behavior, } from "./builders";
import { Keyed } from "./Keyed";
import { Addressable } from "./Addressable";
import { Container } from "./Container";

export class Property extends Keyed<Addressable> {
    private constructor(
        database: Database,
        address: Muid
    ) {
        super(database, address, Behavior.PROPERTY);
    }

    static get(database?: Database, muid?: Muid): Property {
        database = database || Database.recent;
        if (! muid) {
            muid = {timestamp: -1, medallion: -1, offset: Behavior.PROPERTY}
        }
        return new Property(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Property> {
        database = database || Database.recent;
        const muid = await Container.addContainer({behavior: Behavior.PROPERTY, database, meta});
        return new Property(database, muid);
    }

}
