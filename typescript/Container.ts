import { GinkInstance } from "./GinkInstance";
import { PendingCommit } from "./PendingCommit";
import { Entry } from "entry_pb";
import { Value as ValueMessage } from "value_pb";
import { Address, ContainerArgs, Basic } from "./typedefs";
import { addressToMuid, wrapValue } from "./utils";
import { AddressableObject } from "addressable_object_pb";

export class Container {
    readonly ginkInstance: GinkInstance;
    readonly isRoot: boolean;
    constructor(private args: ContainerArgs) {

    }

    get address(): Address {
        throw new Error("not implemented");
    }

    /**
     * Sets a key/value association in a 
     * @param key 
     * @param value 
     * @param commit
     * @returns a promise that resolves to the address of the newly created entry  
     */
    async set(key: Basic, value: Basic|Container, commit?: PendingCommit): Promise<Address> {
        let immediate: boolean = false;
        if (!commit) {
            immediate = true;
            commit = new PendingCommit();
        }

        const entry = new Entry();
        if (!this.isRoot) {
            entry.setSource(addressToMuid(this.address, commit.medallion));    
        }
        // TODO: check the key against the ValueType for keys (if set)
        entry.setKey(wrapValue(key));

        // TODO: check that the destination/value is compatible with Container
        if (value instanceof Container) {
            entry.setDestination(addressToMuid(this.address, commit.medallion));          
        } else {
            entry.setValue(wrapValue(value));
        }
        const addresableObject = new AddressableObject();
        addresableObject.setEntry(entry);
        const address = commit.addAddressableObject(addresableObject);
        if (immediate) {
            await this.ginkInstance.addPendingCommit(commit);
        }
        return address;
    }
}
