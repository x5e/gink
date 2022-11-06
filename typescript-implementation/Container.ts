import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Value, KeyType, Muid } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey, ensure } from "./utils";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { Deletion } from "./Deletion";
import { GinkInstance } from "./GinkInstance";


export class Container {
    protected static readonly DELETION = new Deletion();


    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerBuilder will try to fetch if not specified
     */
    protected constructor(readonly ginkInstance: GinkInstance, readonly address: Muid, protected containerBuilder?: ContainerBuilder) {
        ensure(address.timestamp == 0 || containerBuilder !== undefined, "missing container definition");
    }

    toString(): string {
        const address = this.address;
        return `Container(${address.timestamp},${address.medallion},${address.offset})`;
    }

    /**
     * 
     * @param key If absent, create a boxed entry, if KeyType, set a key in entry, if true, create a list entry
     * @param value What the container ought to contain (an immediate Value, a reference, or a deletion)
     * @param changeSet Change set to add this change to, or empty to apply immediately.
     * @returns a promise the resolves to the muid of the change
     */
    protected async addEntry(key?: KeyType | true, value?: Value | Container | Deletion, changeSet?: ChangeSet): Promise<Muid> {
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }

        const entry = new EntryBuilder();
        if (this.address) {
            entry.setContainer(muidToBuilder(this.address, changeSet.medallion));
        }

        if (key === undefined) {
            entry.setBoxed(true);
        } else if (typeof (key) == "number" || typeof (key) == "string") {
            entry.setKey(wrapKey(key));
        }

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Container) {
                entry.setPointee(muidToBuilder(value.address, changeSet.medallion));
            } else if (value instanceof Deletion) {
                entry.setDeleting(true);
            } else {
                entry.setImmediate(wrapValue(value));
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
