import { Muid, UserKey } from "./typedefs";
import { ensure } from "./utils";
import { Database } from "./Database";
import { Behavior, ContainerBuilder } from "./builders";
import { Keyed } from "./Keyed";

export class Directory extends Keyed<UserKey> {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.DIRECTORY);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.DIRECTORY);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.DIRECTORY);
        }
    }
}
