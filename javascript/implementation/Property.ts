import { Container } from "./Container";
import { Value, Muid, AsOf, MuidTuple } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidTupleToMuid, muidTupleToString } from "./utils";
import { Database } from "./Database";
import { construct, interpret } from "./factories";
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
        return !!(entry && !entry.deletion);
    }

    async toMap(asOf?: AsOf): Promise<Map<string, Value | Container>> {
        const entryMap = await this.database.store.getKeyedEntries(this.address, asOf);
        const result: Map<string, Value | Container> = new Map();
        for (const entry of entryMap.values()) {
            const key = muidTupleToString(<MuidTuple>entry.effectiveKey);
            const pointee = entry.pointeeList.length > 0 ? muidTupleToMuid(entry.pointeeList[0]) : undefined;
            const val = entry.value !== undefined ? entry.value : await construct(this.database, pointee);
            result.set(key, val);
        }
        return result;
    }

}
