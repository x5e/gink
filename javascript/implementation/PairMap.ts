import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, MuidTuple, AsOf, Entry, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, muidTupleToMuid, stringToMuid } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class PairMap extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PAIR_MAP);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.PAIR_MAP);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.PAIR_MAP);
        }
    }

    async set(key: [Muid, Muid]|[Container, Container], value: Value|Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, value, change);
    }

    async get(key: [Muid, Muid]|[Container, Container], asOf?: AsOf): Promise<Value|Container> {
        const found = await this.ginkInstance.store.getEntryByKey(this.address, key, asOf);
        if (found && !found.deletion) return found.value;
    }

    async delete(key: [Muid, Muid]|[Container, Container], change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return entries.size;
    }
}
