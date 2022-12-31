import { Bundler } from "./Bundler";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Value, KeyType, Muid, AsOf } from "./typedefs";
import { muidToBuilder, wrapValue, wrapKey } from "./utils";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { Deletion } from "./Deletion";
import { GinkInstance } from "./GinkInstance";
import { Behavior } from "gink/protoc.out/behavior_pb";



export class Container {
    protected static readonly DELETION = new Deletion();

    /**
     * I can't import List, Directory, etc. into this file because it will cause the inherits clauses to break.
     * So anything that creates containers from the Container class has to be implemented elsewhere and patched in.
     * See factories.ts for the actual implementation.
     * 
     * The backrefs capability would allow you to find containers pointing to this container as of a particular time.
     */
    static _getBackRefsFunction: (a: GinkInstance, b: Container, c?: AsOf) => AsyncGenerator<[KeyType | Muid | undefined, Container], void, unknown>;

    /**
     * 
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param containerBuilder will try to fetch if not specified
     */
    protected constructor(
        readonly ginkInstance: GinkInstance, 
        readonly address: Muid, 
        readonly behavior: Behavior) {}

    /**
     * Starts an async iterator that returns all of the containers pointing to the object in question..
     * Note: the behavior of this method may change to only include backrefs to lists and vertices
     * (e.g. those connections that are popped rather than overwritten, so I know when they're removed)
     * @param asOf Effective time to look at.
     * @returns an async generator of [key, Container], where key is they Directory key, or List entry muid, or undefined for Box
     */
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
     * @param change Bundler to add this change to, or empty to apply immediately.
     * @returns a promise the resolves to the muid of the change
     */
    protected async addEntry(key?: KeyType | true, value?: Value | Container | Deletion, change?: Bundler | string): Promise<Muid> {
        let immediate: boolean = false;
        if (!(change instanceof Bundler)) {
            immediate = true;
            const msg = change;
            change = new Bundler(msg);
        }

        const entryBuilder = new EntryBuilder();
        if (this.address) {
            entryBuilder.setContainer(muidToBuilder(this.address, change.medallion));
        }

        entryBuilder.setBehavior(this.behavior);        

        if (typeof (key) == "number" || typeof (key) == "string") {
            entryBuilder.setKey(wrapKey(key));
        }

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Container) {
                entryBuilder.setPointee(muidToBuilder(value.address, change.medallion));
            } else if (value instanceof Deletion) {
                entryBuilder.setDeleting(true);
            } else {
                entryBuilder.setValue(wrapValue(value));
            }

        }
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setEntry(entryBuilder);
        const address = change.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addBundler(change);
        }
        return address;
    }
}
