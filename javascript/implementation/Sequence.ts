import { Database } from "./Database";
import { Container } from "./Container";
import { AsOf, Entry, Muid, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, generateTimestamp, muidToBuilder, muidToString, muidTupleToMuid } from "./utils";
import { interpret, toJson } from "./factories";
import { Behavior, ChangeBuilder, MovementBuilder, ContainerBuilder } from "./builders";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift because order is defined by insertion order.
 */
export class Sequence extends Container {

    constructor(database: Database, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.SEQUENCE);
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
    async push(value: Value | Container, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(true, value, change);
    }

    async move(
        muidOrPosition: Muid | number,
        dest: number,
        purge?: boolean,
        bundlerOrComment?: Bundler | string) {
        const store = this.database.store;
        // TODO: clarify what's going on here
        const muid = (typeof (muidOrPosition) == "object") ? muidOrPosition :
            muidTupleToMuid(Array.from(
                (await store.getOrderedEntries(this.address, muidOrPosition)).values()).pop().entryId);
        ensure(muid.timestamp && muid.medallion && muid.offset);
        return this.movementHelper(muid, await this.findDest(dest), purge, bundlerOrComment);
    }

    private async findDest(dest: number): Promise<number> {
        if (dest > +1e6) return dest;
        if (dest < -1e6) return generateTimestamp() + dest;
        while (dest > 0) { // I'm using while/break to get go-to like behavior.
            const thereNow = await this.getEntryAt(dest);
            if (!thereNow) { dest = -1; break; } // move to end
            const before = await this.getEntryAt(dest - 1);
            const nowTs = <number>thereNow.effectiveKey;
            const beforeTs = <number>before.effectiveKey;
            if (nowTs - beforeTs < 2)
                throw new Error("no space between entries");
            const intended = beforeTs + Math.floor((nowTs - beforeTs) / 2);
            ensure(intended > beforeTs && intended < nowTs, "can't find place to put entry");
            return intended;
        }
        if (dest == 0 || dest == -1) {
            const currentFrontOrBack = <number>(await this.getEntryAt(dest)).effectiveKey;
            return currentFrontOrBack - Math.sign(dest + .5) * Math.floor(1e3 * Math.random());
        }
        throw new Error("not implemented");
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immediately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param what - position or Muid, defaults to last
     * @param purge - If true, removes so data cannot be recovered with "asOf" query
     * @param bundlerOrComment
     */
    async pop(what?: Muid | number, purge?: boolean, bundlerOrComment?: Bundler | string):
            Promise<Container | Value | undefined> {
        let returning: Container | Value;
        let muid: Muid;
        if (what && typeof (what) == "object") {
            muid = what;
            const entry = await this.database.store.getEntryById(muid);
            if (!entry) return undefined;
            ensure(entry.entryId[0] == muid.timestamp && entry.entryId[2] == muid.offset);
            returning = await interpret(entry, this.database);
        } else {
            what = (typeof (what) == "number") ? what : -1;
            // Should probably change the implementation to not copy all intermediate entries into memory.
            const entries = Array.from((await this.database.store.getOrderedEntries(this.address, what)).values());
            if (entries.length == 0) return undefined;
            const entry = entries[entries.length - 1];
            returning = await interpret(entry, this.database);
            muid = muidTupleToMuid(entry.entryId);
        }
        await this.movementHelper(muid, undefined, purge, bundlerOrComment);
        return returning;
    }

    private async movementHelper(muid: Muid, dest?: number, purge?: boolean, bundlerOrComment?: string | Bundler) {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        const movementBuilder = new MovementBuilder();
        movementBuilder.setEntry(muidToBuilder(muid));
        if (dest)
            movementBuilder.setDest(dest);
        movementBuilder.setContainer(muidToBuilder(this.address));
        if (purge)
            movementBuilder.setPurge(true);
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setMovement(movementBuilder);
        bundler.addChange(changeBuilder);
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }

    /**
     * Alias for this.pop(0, purge, bundlerOrComment)
     */
    async shift(purge?: boolean, bundlerOrComment?: Bundler | string): Promise<Container | Value | undefined> {
        return await this.pop(0, purge, bundlerOrComment);
    }

    private async getEntryAt(position: number, asOf?: AsOf): Promise<Entry | undefined> {
        //TODO add a store method to only return the entry at a given location
        const entries = await this.database.store.getOrderedEntries(this.address, position, asOf);
        if (entries.size == 0)
            return undefined;
        if (position >= 0 && position >= entries.size)
            return undefined;
        if (position < 0 && Math.abs(position) > entries.size)
            return undefined;
        let val: Entry;
        for (let found of entries.values()) {
            val = found;
        }
        return val;
    }

    /**
     *
     * @param position Index to look for the thing, negative counts from end, or muid of entry
     * @param asOf
     * @returns value at the position of the list, or undefined if list is too small
     */
    async at(position: number, asOf?: AsOf): Promise<Container | Value | undefined> {
        if (typeof (position) == "number") {
            const entry = await this.getEntryAt(position, asOf);
            return await interpret(entry, this.database);
        }
        throw Error("unexpected");
    }

    /**
     * Dumps the contents of this list to a javascript array.
     * useful for debugging and could also be used to export data by walking the tree
     * @param through how many elements to get, positive starting from beginning, negative starting from end
     * @param asOf effective time to get the dump for: leave undefined to get data as of the present
     * @returns an array containing Values (e.g. numbers, strings) and Containers (e.g. other Lists, Boxes, Directories)
     */
    async toArray(through = Infinity, asOf?: AsOf): Promise<(Container | Value)[]> {
        const thisList = this;
        const entries = await thisList.database.store.getOrderedEntries(thisList.address, through, asOf);
        const applied = Array.from(entries.values());
        return await Promise.all(applied.map(async function (entry: Entry): Promise<Container | Value> {
            return await interpret(entry, thisList.database);
        }));
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getOrderedEntries(this.address, Infinity, asOf);
        return entries.size;
    }

    /**
     * Function to iterate over the contents of the List, showing the address of each entry (which can be used in pop).
     * @param through count of many things to iterate through, positive starting from front, negative for end
     * @param asOf effective time to get the contents for
     * @returns an async iterator across everything in the list, with values returned being pairs of Muid, (Value|Container),
     */
    entries(through = Infinity, asOf?: AsOf): AsyncGenerator<[Muid, Value | Container], void, unknown> {
        const thisList = this;
        return (async function* () {
            // Note: I'm loading all entries memory despite using an async generator due to shitty IndexedDb
            // behavior of closing transactions when you await on something else.  Hopefully they'll fix that in
            // the future and I can improve this.  Alternative, it might make sense to hydrate everything in a single pass.
            const entries = await thisList.database.store.getOrderedEntries(thisList.address, through, asOf);
            for (const entry of entries) {
                const hydrated = await interpret(entry[1], thisList.database);
                yield [muidTupleToMuid(entry[1].entryId), hydrated];
            }
        })();
    }

    /**
     * Generates a JSON representation of the data in the list.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
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
