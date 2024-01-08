import { Container } from "./Container";
import { Value, Muid, KeyType, AsOf, Entry } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";
import { Addressable } from "./Addressable";

export class Property extends Container {
    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PROPERTY);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.PROPERTY);
        } else {
            ensure(containerBuilder && containerBuilder.getBehavior() == Behavior.PROPERTY);
        }
    }

    async set(subject: Addressable, value: Value | Addressable, bundlerOrComment?: Bundler | string): Promise<Muid> {
        return await this.addEntry(subject, value, bundlerOrComment);
    }

    async delete(subject: Addressable, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(subject, Container.DELETION, change);
    }

    async get(subject: Addressable, asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, subject.address, asOf);
        return interpret(entry, this.ginkInstance);
    }

    async has(subject: Addressable, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, subject.address, asOf);
        return result !== undefined;
    }

    async getAll(asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const result = await this.ginkInstance.store.getKeyedEntries(this.address, asOf);
        return result;
    }


}
