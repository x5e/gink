import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Value, Muid, Entry, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToBuilder, muidToString, muidTupleToMuid } from "./utils";
import { Movement as MovementBuilder } from "gink/protoc.out/movement_pb";
import { Change as ChangeBuilder } from "gink/protoc.out/change_pb";
import { interpret, toJson } from "./factories";
import { Behavior } from "gink/protoc.out/behavior_pb";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift because order is defined by insertion order.
 */
export class Sequence extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.SEQUENCE);
        if (this.address.timestamp < 0) {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(address.offset == Behavior.SEQUENCE, "magic tag not SEQUENCE");
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.SEQUENCE, "container not sequence");
        }
    }

    /**
     * Adds an element to the end of the list.
     * @param value 
     * @param change change set to apply the change to or comment to put in
     * @returns 
     */
    async push(value: Value | Container, change?: Bundler|string): Promise<Muid> {
        return await this.addEntry(true, value, change);
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immedately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param muid 
     * @param change 
     */
    async pop(what?: Muid | number, change?: Bundler|string): Promise<Container | Value | undefined> {
        let returning: Container | Value;
        let muid: Muid;
        if (what && typeof (what) == "object") {
            muid = what;
            const entry = await this.ginkInstance.store.getEntry(this.address, muid);
            if (!entry) return undefined;
            ensure(entry.entryId[0] == muid.timestamp && entry.entryId[2] == muid.offset);
            returning = await interpret(entry, this.ginkInstance);
        } else {
            what = (typeof (what) == "number") ? what : -1;
            // Should probably change the implementation to not copy all intermediate entries into memory.
            const entries = await this.ginkInstance.store.getOrderedEntries(this.address, what)
            if (entries.length == 0) return undefined;
            const entry = entries[entries.length - 1]
            returning = await interpret(entry, this.ginkInstance);
            muid = muidTupleToMuid(entry.entryId);
        }
        let immediate: boolean = false;
        if (!(change instanceof Bundler)) {
            immediate = true;
            change = new Bundler(change);
        }
        const movementBuilder = new MovementBuilder();
        movementBuilder.setEntry(muidToBuilder(muid));
        movementBuilder.setContainer(muidToBuilder(this.address));
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setMovement(movementBuilder);
        change.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addBundler(change);
        }
        return returning;
    }

    /**
     * Alias for this.pop(0, changeSet)
     */
    async shift(change?: Bundler|string): Promise<Container | Value | undefined> {
        return await this.pop(0, change)
    }

    /**
     * 
     * @param position Index to look for the thing, negative counts from end, or muid of entry
     * @param asOf 
     * @returns value at the position of the list, or undefined if list is too small
     */
    async at(position: number|Muid, asOf?: AsOf): Promise<Container | Value | undefined> {
        if (typeof(position) == "number") {
            //TODO(https://github.com/google/gink/issues/68): fix crummy algo
            const entries = await this.ginkInstance.store.getOrderedEntries(this.address, position, asOf);
            if (entries.length == 0) return undefined;
            if (position >= 0 && position >= entries.length) return undefined;
            if (position < 0 && Math.abs(position) > entries.length) return undefined;
            const entry = entries[entries.length - 1];
            return await interpret(entry, this.ginkInstance);
        } else {
            const entry = await this.ginkInstance.store.getEntry(this.address, position, asOf);
            if (!entry) return undefined;
            return await interpret(entry, this.ginkInstance);
        }
    }

    /**
     * Dumps the contents of this list to a javascript array.
     * useful for debugging and could also be use to export data by walking the tree
     * @param through how many elements to get, positive starting from beginning, negative starting from end
     * @param asOf effective time to get the dump for: leave undefined to get data as of the present
     * @returns an array containing Values (e.g. numbers, strings) and Containers (e.g. other Lists, Boxes, Directories)
     */
    async toArray(through: number = Infinity, asOf?: AsOf): Promise<(Container | Value)[]> {
        const thisList = this;
        const entries = await thisList.ginkInstance.store.getOrderedEntries(thisList.address, through, asOf);
        const transformed = await Promise.all(entries.map(async function (entry: Entry): Promise<Container | Value> {
            return await interpret(entry, thisList.ginkInstance);
        }));
        return transformed;
    }

    async size(asOf?: AsOf): Promise<number> {
        //TODO(TESTME)
        const entries = await this.ginkInstance.store.getOrderedEntries(this.address, Infinity, asOf);
        return entries.length;
    }

    /**
     * Function to iterate over the contents of the List, showing the address of each entry (which can be used in pop).
     * @param through count of many things to iterate through, positive starting from front, negative for end
     * @param asOf effective time to get the contents for
     * @returns an async iterator across everything in the list, with values returned being pairs of Muid, (Value|Container),
     */
    entries(through: number=Infinity, asOf?: AsOf): AsyncGenerator<[Muid,Value|Container], void, unknown> {
        const thisList = this;
        return (async function*(){
            // Note: I'm loading all entries memory despite using an async generator due to shitty IndexedDb 
            // behavior of closing transactions when you await on something else.  Hopefully they'll fix that in
            // the future and I can improve this.  Alternative, it might make sense to hydrate everything in a single pass.
            const entries = await thisList.ginkInstance.store.getOrderedEntries(thisList.address, through, asOf);
            for (const entry of entries) {
                const hydrated = await interpret(entry, thisList.ginkInstance);
                yield [muidTupleToMuid(entry.entryId), hydrated];
            }
        })();
    }

    /**
     * Generates a JSON representation of the data in the list.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number|boolean=false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        if (seen === undefined) seen = new Set();
        ensure(indent === false, "indent not implemented");
        const mySig = muidToString(this.address);
        if (seen.has(mySig)) return "null";
        seen.add(mySig);
        const asArray = await this.toArray(Infinity, asOf);
        let returning = "[";
        let first = true;
        for (const value of asArray) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += await toJson(value, indent === false ? false : +indent + 1, asOf, seen);
        }
        returning += "]";
        return returning;
    }

}
