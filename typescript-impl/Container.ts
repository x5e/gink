import { ChangeSet } from "./ChangeSet";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Value, KeyType, Muid, AsOf } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey, ensure } from "./utils";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { Deletion } from "./Deletion";
import { GinkInstance } from "./GinkInstance";



export class Container {
    protected static readonly DELETION = new Deletion();
    static _getBackRefsFunction: (a: GinkInstance, b: Container, c?: AsOf) => AsyncGenerator<[KeyType | Muid | undefined, Container], void, unknown>; 

    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerBuilder will try to fetch if not specified
     */
    protected constructor(readonly ginkInstance: GinkInstance, readonly address: Muid, protected containerBuilder?: ContainerBuilder) {
        ensure(containerBuilder !== undefined || address.timestamp < 0, "missing container definition");
    }

    public getBackRefs(asOf?: AsOf): AsyncGenerator<[KeyType | Muid | undefined, Container], void, unknown> {
        return Container._getBackRefsFunction(this.ginkInstance, this, asOf);
    }

    public toString(): string {
        const address = this.address;
        return `Container(${address.timestamp},${address.medallion},${address.offset})`;
    }

    /**
     * 
     * @param key If absent, create a boxed entry, if KeyType, set a key in entry, if true, create a list entry
     * @param value What the container ought to contain (an immediate Value, a reference, or a deletion)
     * @param change Change set to add this change to, or empty to apply immediately.
     * @returns a promise the resolves to the muid of the change
     */
    protected async addEntry(key?: KeyType | true, value?: Value | Container | Deletion, change?: ChangeSet|string): Promise<Muid> {
        let immediate: boolean = false;
        if (!(change instanceof ChangeSet)) {
            immediate = true;
            const msg = change;
            change = new ChangeSet(msg);
        }

        const entry = new EntryBuilder();
        if (this.address) {
            entry.setContainer(muidToBuilder(this.address, change.medallion));
        }

        if (key === undefined) {
            entry.setBoxed(true);
        } else if (typeof (key) == "number" || typeof (key) == "string") {
            entry.setKey(wrapKey(key));
        }

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Container) {
                entry.setPointee(muidToBuilder(value.address, change.medallion));
            } else if (value instanceof Deletion) {
                entry.setDeleting(true);
            } else {
                entry.setImmediate(wrapValue(value));
            }

        }
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setEntry(entry);
        const address = change.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addChangeSet(change);
        }
        return address;
    }
}
