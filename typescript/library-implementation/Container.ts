import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "entry_pb";
import { Value, KeyType, Muid, Entry } from "./typedefs";
import { muidToBuilder, wrapValue } from "./utils";
import { Change as ChangeBuilder } from "change_pb";
import { Container as ContainerBuilder } from "container_pb";
import { Deletion } from "./Deletion";
import { ensure } from "./utils";
import { GinkInstance } from "./GinkInstance";


export class Container {
    readonly initialized: Promise<void>;
    protected static readonly DELETION = new Deletion();


    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerBuilder will try to fetch if not specified
     */
    protected constructor(readonly ginkInstance: GinkInstance, readonly address?: Muid,
        protected containerBuilder?: ContainerBuilder) {
        ensure(containerBuilder || !address);
        this.initialized = ginkInstance.initialized;
    }

    protected async addEntry(key?: KeyType, value?: Value | Container | Deletion, changeSet?: ChangeSet): Promise<Muid> {
        await this.initialized;
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }

        const entry = new EntryBuilder();
        if (this.address) {
            entry.setContainer(muidToBuilder(this.address, changeSet.medallion));
        }
        // TODO: check the key against the ValueType for keys (if set)
        if (key)
            entry.setKey(wrapValue(key));

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
