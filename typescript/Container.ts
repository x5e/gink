import { GinkInstance } from "./GinkInstance";
import { ChangeSet } from "./ChangeSet";
import { Entry } from "entry_pb";
import { Address, Basic } from "./typedefs";
import { addressToMuid, wrapValue, Deletion } from "./utils";
import { Change } from "change_pb";
import { Container as ContainerMessage } from "container_pb";


export class Container {
    readonly ready: Promise<void>;
    static readonly DELETION = new Deletion();

    constructor(readonly ginkInstance: GinkInstance, readonly address?: Address,
        protected containerMessage?: ContainerMessage) {
        if (address && !containerMessage) {
            //TODO: go and fetch the ContainerMessage from the db using the address
            throw new Error("not implemented");
        }
        this.ready = Promise.resolve();
    }

    protected async addEntry(key?: Basic, value?: Basic | Container | Deletion, changeSet?: ChangeSet): Promise<Address> {
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }

        const entry = new Entry();
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
