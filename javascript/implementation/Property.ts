import { Container } from "./Container";
import { Value, Muid, AsOf, } from "./typedefs";
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
        return await this.addEntry(subject,
            value instanceof Addressable ? value.address : value, bundlerOrComment);
    }

    async delete(subject: Addressable, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(subject, Container.DELETION, change);
    }

    async get(subject: Addressable, asOf?: AsOf): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(this.address, subject.address, asOf);
        return interpret(entry, this.database);
    }

    async has(subject: Addressable, asOf?: AsOf): Promise<boolean> {
        const entry = await this.database.store.getEntryByKey(this.address, subject.address, asOf);
        return entry && !entry.deletion;
    }

}
