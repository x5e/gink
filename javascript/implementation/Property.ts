import { Container } from "./Container";
import { Value, Muid, KeyType, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
import { GinkInstance } from "./GinkInstance";
import { toJson, interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class Property extends Container {
    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.PROPERTY);
        if (this.address.timestamp < 0) {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset == Behavior.PROPERTY);
        } else {
            ensure(containerBuilder && containerBuilder.getBehavior() == Behavior.PROPERTY);
        }
    }

    async set(subject: Container, value: Value | Container, bundlerOrComment?: Bundler|string): Promise<Muid> {
        return await this.addEntry(subject, value, bundlerOrComment);
    }

    async delete(subject: Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(subject, Container.DELETION, change);
    }

    async get(subject: Container, asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, subject.address, asOf);
        return interpret(entry, this.ginkInstance);
    }

    async has(subject: Container, asOf?: AsOf): Promise<boolean> {
        const result = await this.ginkInstance.store.getEntryByKey(this.address, subject.address, asOf);
        return result !== undefined;
    }


}