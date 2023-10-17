import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Muid, AsOf } from "./typedefs";
import { Behavior, ContainerBuilder} from "./builders";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";

export class Verb extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.VERB);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.VERB);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() == Behavior.VERB);
        }
    }

    /**
    * Returns a promise that resolves to true showing if this placeholder is/was visible at the
    * specified time (default now), or false if it was soft deleted.
    * @returns undefined, a basic value, or a container
    */
    async isAlive(asOf?: AsOf): Promise<boolean> {
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, undefined, asOf);
        return (entry === undefined || !entry.deletion);
    }

    /**
     * Performs a soft delete of this graph node.
     */
    async remove(change?: Bundler|string): Promise<Muid> {
        return this.addEntry(undefined, Container.DELETION, change);
    }

}
