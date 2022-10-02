import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import {  Basic } from "./typedefs";
import { Address, InstanceInterface } from "./interfaces";
import { addressToMuid, wrapValue, Deletion, unwrapValue, assert } from "./utils";
import { Change } from "change_pb";
import { Container as ContainerMessage } from "container_pb";


export class Container {
    readonly ready: Promise<void>;
    protected static readonly DELETION = new Deletion();

    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerMessage will try to fetch if not specified
     */
    constructor(readonly ginkInstance: InstanceInterface, readonly address?: Address,
        protected containerMessage?: ContainerMessage) {
        if (address && !containerMessage) {
            //TODO: go and fetch the ContainerMessage from the db using the address
            throw new Error("not implemented");
        }
        this.ready = ginkInstance.initialized;
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
     async set(key: Basic, value: Basic | Container,  changeSet?: ChangeSet): Promise<Address> {
        if (this.address) {
            assert(this.containerMessage.getBehavior() == ContainerMessage.SCHEMA);
        }
        return await this.addEntry(key, value, changeSet);
    }

    async delete(key: Basic, changeSet?: ChangeSet): Promise<Address> {
        if (this.containerMessage) { // not set for root schema
            const behavior = this.containerMessage.getBehavior();
            assert(behavior == ContainerMessage.SCHEMA || behavior == ContainerMessage.SET);
        }
        return await this.addEntry(key, Container.DELETION, changeSet);
    }

    async get(key: Basic): Promise<Basic|undefined> {
        await this.ready;
        const entryBytes = await this.ginkInstance.store.getEntryBytes(key, this.address);
        if (!entryBytes) return;
        const entryBuilder = EntryBuilder.deserializeBinary(entryBytes);
        if (entryBuilder.hasValue()) return unwrapValue(entryBuilder.getValue());
        throw new Error("non-trivial entries not supported yet");
    }

    protected async addEntry(key?: Basic, value?: Basic | Container | Deletion, changeSet?: ChangeSet): Promise<Address> {
        await this.ready;
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }

        const entry = new EntryBuilder();
        if (this.address) {
            entry.setSource(addressToMuid(this.address, changeSet.medallion));
        }
        // TODO: check the key against the ValueType for keys (if set)
        if (key)
            entry.setKey(wrapValue(key));

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Container) {
                entry.setDestination(addressToMuid(this.address, changeSet.medallion));
            } else if (value instanceof Deletion) {
                entry.setDeleting(true);
            } else {
                entry.setValue(wrapValue(value));
            }

        }
        const change = new Change();
        change.setEntry(entry);
        const address = changeSet.addChange(change);
        if (immediate) {
            await this.ginkInstance.addChangeSet(changeSet);
        }
        return address;
    }



}
