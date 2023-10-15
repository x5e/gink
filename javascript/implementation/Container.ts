import {Bundler} from "./Bundler";
import {Value, KeyType, Muid, AsOf} from "./typedefs";
import {muidToBuilder, wrapValue, wrapKey, ensure} from "./utils";
import {Deletion} from "./Deletion";
import { Inclusion } from "./Inclusion";
import {GinkInstance} from "./GinkInstance";
import { EntryBuilder, ChangeBuilder, Behavior, ClearanceBuilder } from "./builders";
import { PairBuilder } from "./builders";


export class Container {
    protected static readonly DELETION = new Deletion();
    protected static readonly INCLUSION = new Inclusion();

    /**
     * I can't import List, Directory, etc. into this file because it will cause the inherits clauses to break.
     * So anything that creates containers from the Container class has to be implemented elsewhere and patched in.
     * See factories.ts for the actual implementation.
     *
     * The backref capability would allow you to find containers pointing to this container as of a particular time.
     */
    static _getBackRefsFunction: (a: GinkInstance, b: Container, c?: AsOf) => AsyncGenerator<[KeyType | Muid | undefined, Container], void>;

    /**
     *
     * @param ginkInstance required
     * @param address not necessary for root schema
     * @param behavior
     */
    protected constructor(
        readonly ginkInstance: GinkInstance,
        readonly address: Muid,
        readonly behavior: Behavior) {
    }

    public equals(other: any): boolean {
        if (!(other instanceof Container)) return false;
        return ((other.address.medallion == this.address.medallion) &&
            (other.address.offset == this.address.offset) &&
            (other.address.timestamp == this.address.timestamp))
    }

    /**
     * Starts an async iterator that returns all the containers pointing to the object in question.
     * Note: the behavior of this method may change to only include backref to lists and vertices
     * (e.g. those connections that are popped rather than overwritten, so I know when they're removed)
     * @param asOf Effective time to look at.
     * @returns an async generator of [key, Container], where key is they Directory key, or List entry muid, or undefined for Box
     */
    public getBackRefs(asOf?: AsOf): AsyncGenerator<[KeyType | Muid | undefined, Container], void> {
        return Container._getBackRefsFunction(this.ginkInstance, this, asOf);
    }

    public toString(): string {
        const address = this.address;
        return `Container(${address.timestamp},${address.medallion},${address.offset})`;
    }

    public async clear(purge?: boolean, bundlerOrComment?: Bundler | string): Promise<Muid> {
        if (!(purge === undefined || purge === true || purge === false)) {
            throw new Error("first parameter to clear must be boolean (true => purge)");
        }
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler){
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        const clearanceBuilder = new ClearanceBuilder();
        clearanceBuilder.setPurge(purge || false);
        clearanceBuilder.setContainer(muidToBuilder(this.address, bundler.medallion));
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setClearance(clearanceBuilder);
        const address = bundler.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addBundler(bundler);
        }
        return address;
    }

    /**
     *
     * @param key If absent, create a boxed entry, if KeyType, set a key in entry, if true, create a list entry
     * @param value What the container ought to contain (an immediate Value, a reference, or a deletion)
     * @param bundlerOrComment Bundler to add this change to, or empty to apply immediately.
     * @returns a promise the resolves to the muid of the change
     */
    protected async addEntry(
        key?: KeyType | true | Container | Muid | [Muid|Container, Muid|Container],
        value?: Value | Container | Deletion | Inclusion,
        bundlerOrComment?: Bundler | string):
            Promise<Muid> {
        let immediate = false;
        let bundler: Bundler;

        if (bundlerOrComment instanceof Bundler){
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }

        const entryBuilder = new EntryBuilder();
        if (this.address) {
            entryBuilder.setContainer(muidToBuilder(this.address, bundler.medallion));
        }

        entryBuilder.setBehavior(this.behavior);

        if (typeof (key) == "number" || typeof (key) == "string" || key instanceof Uint8Array) {
            entryBuilder.setKey(wrapKey(key));
        }

        else if (key instanceof Container) {
            entryBuilder.setDescribing(muidToBuilder(key.address));
        }
        else if (key instanceof Array) {
            const pair = new PairBuilder();
            if ("address" in key[0]) { // Left is a container
                pair.setLeft(muidToBuilder(key[0].address));
            }
            if ("address" in key[1]) { // Right is a container
                pair.setRite(muidToBuilder(key[1].address));
            }
            if (!("address" in key[0])) { // Left is a muid
                pair.setLeft(muidToBuilder(key[0]));
            }
            if (!("address" in key[1])) { // Right is a Muid
                pair.setRite(muidToBuilder(key[1]));
            }
            entryBuilder.setPair(pair);
        }
        else if (typeof (key) == "object") { // Key is a Muid
            entryBuilder.setDescribing(muidToBuilder(key));
        }

        // TODO: check that the destination/value is compatible with Container
        if (value !== undefined) {
            if (value instanceof Container) {
                entryBuilder.setPointee(muidToBuilder(value.address, bundler.medallion));
            } else if (value instanceof Deletion) {
                entryBuilder.setDeletion(true);
            } else if (value instanceof Inclusion) {

            } else {
                entryBuilder.setValue(wrapValue(value));
            }
        }
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setEntry(entryBuilder);
        const address = bundler.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addBundler(bundler);
        }
        return address;
    }
}
