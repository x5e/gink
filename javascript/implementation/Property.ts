import { Muid } from "./typedefs";
import { ensure } from "./utils";
import { Database } from "./Database";
import { Behavior, ContainerBuilder } from "./builders";
import { Keyed } from "./Keyed";
import { Addressable } from "./Addressable";

export class Property extends Keyed<Addressable> {
    constructor(
        database: Database,
        address: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.PROPERTY);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.PROPERTY);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.PROPERTY);
        }
    }
}
