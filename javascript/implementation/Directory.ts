import { Muid, ScalarKey, Meta } from "./typedefs";
import { Database } from "./Database";
import { Behavior } from "./builders";
import { Keyed } from "./Keyed";
import { Container } from "./Container";

export class Directory extends Keyed<ScalarKey> {
    private constructor(database: Database, address: Muid) {
        super(database, address, Behavior.DIRECTORY);
    }

    static get(database?: Database, muid?: Muid): Directory {
        database = database || Database.recent;
        if (!muid) {
            muid = { timestamp: -1, medallion: -1, offset: Behavior.DIRECTORY };
        }
        return new Directory(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Directory> {
        database = database || Database.recent;
        const muid = await Container.addContainer({
            behavior: Behavior.DIRECTORY,
            database,
            meta,
        });
        return new Directory(database, muid);
    }
}
