import { Container } from "./Container";
import { Basic, Address } from "./typedefs";
import { Container as ContainerBuilder } from "container_pb";
import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import { ensure, unwrapValue } from "./utils";
import { GinkInstance } from "./GinkInstance";

/**
 * See api.d.ts for docs.
 */
export class Schema extends Container {

    constructor(ginkInstance: GinkInstance, address?: Address, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.SCHEMA);
        }
    }

    /**
     * Sets a key/value association in a Schema.
     * If a change set is supplied, the function will add the entry to that change set 
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a change set, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await mySchema.set("foo", "bar");
     * @param key 
     * @param value 
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created entry  
     */
    async set(key: Basic, value: Basic | Container, changeSet?: ChangeSet): Promise<Address> {
        return await this.addEntry(key, value, changeSet);
    }

    async delete(key: Basic, changeSet?: ChangeSet): Promise<Address> {
        return await this.addEntry(key, Container.DELETION, changeSet);
    }

    async get(key: Basic): Promise<Container | Basic | undefined> {
        await this.initialized;
        const [entryAddress, entryBytes] = await this.ginkInstance.store.getEntry(key, this.address);
        if (!entryBytes) return;
        const entryBuilder = EntryBuilder.deserializeBinary(entryBytes);
        if (entryBuilder.hasValue()) return unwrapValue(entryBuilder.getValue());
        if (entryBuilder.hasDestination()) {
            const muidBuilder = entryBuilder.getDestination();
            const destAddress: Address = {
                timestamp: muidBuilder.getTimestamp() || entryAddress.timestamp,
                medallion: muidBuilder.getMedallion() || entryAddress.medallion,
                offset: ensure(muidBuilder.getOffset(), "zero offset")
            }
            return Container.construct(this.ginkInstance, destAddress);
        }
        throw new Error("non-trivial entries not supported yet");
    }
}