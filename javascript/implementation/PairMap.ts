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
        let pairKey: [Muid, Muid];
        if ("address" in key[0] && "address" in key[1]) { // Key is an array of containers
            pairKey = [key[0].address, key[1].address]
        } else if (!("address" in key[0]) && !("address" in key[1])) { // Key is an array of muids
            pairKey = [key[0], key[1]];
        }
        const found = await this.ginkInstance.store.getEntryByKey(this.address, pairKey, asOf);
        
        if (found && !found.deletion) return found.value;
    }
}