import { Database } from "./Database";
import { Muid } from "./typedefs";
import { ensure } from "./utils";
import { Behavior, ContainerBuilder } from "./builders";
import { Addressable } from "./Addressable";
import { Keyed } from "./Keyed";

export class PairMap extends Keyed<[Addressable, Addressable]> {
    constructor(
        database: Database,
        address: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.PAIR_MAP);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.PAIR_MAP);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.PAIR_MAP);
        }
    }
}
