import { Container } from "./Container";
import { Basic, Address } from "../api";
import { Container as ContainerBuilder } from "container_pb";
import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import { assert, unwrapValue } from "./utils";

/**
 * See api.d.ts for docs.
 */
export class Schema extends Container {

    async set(key: Basic, value: Basic | Container, changeSet?: ChangeSet): Promise<Address> {
        if (this.address) {
            assert(this.containerBuilder.getBehavior() == ContainerBuilder.SCHEMA);
        }
        return await this.addEntry(key, value, changeSet);
    }

    async delete(key: Basic, changeSet?: ChangeSet): Promise<Address> {
        if (this.containerBuilder) { // not set for root schema
            const behavior = this.containerBuilder.getBehavior();
            assert(behavior == ContainerBuilder.SCHEMA || behavior == ContainerBuilder.SET);
        }
        return await this.addEntry(key, Container.DELETION, changeSet);
    }

    async get(key: Basic): Promise<Basic | undefined> {
        await this.initialized;
        const entryBytes = await this.ginkInstance.store.getEntryBytes(key, this.address);
        if (!entryBytes) return;
        const entryBuilder = EntryBuilder.deserializeBinary(entryBytes);
        if (entryBuilder.hasValue()) return unwrapValue(entryBuilder.getValue());
        throw new Error("non-trivial entries not supported yet");
    }
}