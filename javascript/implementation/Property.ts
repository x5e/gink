import { Container } from "./Container";
import { Value, Muid, KeyType, AsOf, Entry } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { Database } from "./Database";
import { interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";
import { Addressable } from "./Addressable";

export class Property extends Container {
    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.PROPERTY);
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
        const entry = await this.database.store.getEntryByKey(this.address, subject.address, asOf);
        return interpret(entry, this.database);
    }

    async has(subject: Addressable, asOf?: AsOf): Promise<boolean> {
        const result = await this.database.store.getEntryByKey(this.address, subject.address, asOf);
        return result !== undefined;
    }

    async getAll(asOf?: AsOf): Promise<Map<KeyType, Entry>> {
        const result = await this.database.store.getKeyedEntries(this.address, asOf);
        return result;
    }


}
