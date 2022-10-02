import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import { Basic, Address, GinkInstance } from "../api";
import { addressToMuid, wrapValue, } from "./utils";
import { Change as ChangeBuilder } from "change_pb";
import { Container as ContainerBuilder } from "container_pb";
import { Deletion } from "./Deletion";

export class Container {
    readonly initialized: Promise<void>;
    protected static readonly DELETION = new Deletion();

    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerBuilder will try to fetch if not specified
     */
    constructor(readonly ginkInstance: GinkInstance, readonly address?: Address,
        protected containerBuilder?: ContainerBuilder) {
        if (address && !containerBuilder) {
            //TODO: go and fetch the ContainerMessage from the db using the address
            throw new Error("not implemented");
        }
        this.initialized = ginkInstance.initialized;
    }

    protected async addEntry(key?: Basic, value?: Basic | Container | Deletion, changeSet?: ChangeSet): Promise<Address> {
        await this.initialized;
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
        const change = new ChangeBuilder();
        change.setEntry(entry);
        const address = changeSet.addChange(change);
        if (immediate) {
            await this.ginkInstance.addChangeSet(changeSet);
        }
        return address;
    }



}
