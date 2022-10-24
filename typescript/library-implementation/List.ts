import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Value, Muid, Entry, AsOf } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure, muidToBuilder, muidToString, muidTupleToMuid } from "./utils";
import { Exit as ExitBuilder } from "exit_pb";
import { Change as ChangeBuilder } from "change_pb";
import { interpret, toJson } from "./factories";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift because order is defined by insertion order.
 */
export class List extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.QUEUE);
        }
    }

    /**
     * Adds an element to the end of the list.
     * @param value 
     * @param changeSet 
     * @returns 
     */
    async push(value: Value | Container, changeSet?: ChangeSet): Promise<Muid> {
        return await this.addEntry(undefined, value, changeSet);
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immedately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param muid 
     * @param changeSet 
     */
    async pop(what?: Muid | number, changeSet?: ChangeSet): Promise<Container | Value | undefined> {
        await this.initialized;
        let returning: Container | Value;
        let muid: Muid;
        if (what && typeof (what) == "object") {
            muid = what;
            const entry = await this.ginkInstance.store.getEntry(this.address, muid);
            ensure(entry.entryId[0] == muid.timestamp && entry.entryId[2] == muid.offset);
            returning = await interpret(entry, this.ginkInstance);
        } else {
            what = (typeof (what) == "number") ? what : -1;
            // Should probably change the implementation to not copy all intermediate entries into memory.
            const entries = await this.ginkInstance.store.getUnKeyedEntries(this.address, what)
            if (entries.length == 0) return undefined;
            const entry = entries.at(-1);
            returning = await interpret(entry, this.ginkInstance);
            muid = muidTupleToMuid(entry.entryId);
        }
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }
        const exitBuilder = new ExitBuilder();
        exitBuilder.setEntry(muidToBuilder(muid));
        exitBuilder.setContainer(muidToBuilder(this.address));
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setExit(exitBuilder);
        changeSet.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addChangeSet(changeSet);
        }
        return returning;
    }

    /**
     * Alias for this.pop(0, changeSet)
     */
    async shift(changeSet?: ChangeSet): Promise<Container | Value | undefined> {
        return await this.pop(0, changeSet)
    }

    /**
     * 
     * @param index Index to look for the thing, negative counts from end.
     * @param asOf 
     * @returns value at the position of the list, or undefined if list is too small
     */
    async at(index: number, asOf?: AsOf) {
        const entries = await this.ginkInstance.store.getUnKeyedEntries(this.address, index, asOf);
        if (entries.length == 0) return undefined;
        if (index >= 0 && index >= entries.length) return undefined;
        if (index < 0 && Math.abs(index) > entries.length) return undefined;
        const entry = entries.at(-1);
        return await interpret(entry, this.ginkInstance);
    }

    async toArray(through: number = Infinity, asOf?: AsOf): Promise<(Container | Value)[]> {
        const thisList = this;
        const entries = await thisList.ginkInstance.store.getUnKeyedEntries(thisList.address, through, asOf);
        const transformed = await Promise.all(entries.map(async function (entry: Entry): Promise<Container | Value> {
            return await interpret(entry, thisList.ginkInstance);
        }));
        return transformed;
    }

    async size(asOf?: AsOf): Promise<number> {
        //TODO(TESTME)
        const entries = await this.ginkInstance.store.getUnKeyedEntries(this.address, Infinity, asOf);
        return entries.length;
    }

    entries(through: number=Infinity, asOf?: AsOf): AsyncGenerator<[Muid,Value|Container], void, unknown> {
        const thisList = this;
        return (async function*(){
            // Note: I'm loading all entries memory despite using an async generator due to shitty IndexedDb 
            // behavior of closing transactions when you await on something else.  Hopefully they'll fix that in
            // the future and I can improve this.  Alternative, it might make sense to hydrate everything in a single pass.
            const entries = await thisList.ginkInstance.store.getUnKeyedEntries(thisList.address, through, asOf);
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
