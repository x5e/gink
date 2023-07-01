import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, MuidTuple, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, muidTupleToMuid } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class PairSet extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PAIR_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.PAIR_SET);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.PAIR_SET);
        }
    }

    /**
     * Includes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(key: [Muid, Muid]|[Container, Container], change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Excludes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(key: [Muid, Muid]|[Container, Container], change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * The number of items in the pair set.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }
}
