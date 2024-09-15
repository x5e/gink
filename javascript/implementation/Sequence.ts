import { Database } from "./Database";
import { Container } from "./Container";
import { AsOf, Entry, Muid, Value } from "./typedefs";
import { Bundler } from "./Bundler";
import {
    ensure,
    generateTimestamp,
    muidToBuilder,
    muidToString,
    muidTupleToMuid,
    muidTupleToString,
    wrapKey,
    wrapValue,
} from "./utils";
import { construct, interpret, toJson } from "./factories";
import { Behavior, ChangeBuilder, ContainerBuilder } from "./builders";
import { EntryBuilder } from "./builders";
import { movementHelper } from "./store_utils";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift because order is defined by insertion order.
 */
export class Sequence extends Container {
    constructor(
        database: Database,
        address?: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.SEQUENCE);
        if (this.address.timestamp < 0) {
            //TODO(https://github.com/google/gink/issues/64): document default magic containers
            ensure(
                address.offset === Behavior.SEQUENCE,
                "magic tag not SEQUENCE"
            );
        } else {
            ensure(
                containerBuilder.getBehavior() === Behavior.SEQUENCE,
                "container not sequence"
            );
        }
    }

    /**
     * Adds an element to the end of the list.
     * @param value
     * @param change change set to apply the change to or comment to put in
     * @returns
     */
    async push(
        value: Value | Container,
        change?: Bundler | string
    ): Promise<Muid> {
        return await this.addEntry(undefined, value, change);
    }

    async move(
        muidOrPosition: Muid | number,
        dest: number,
        purge?: boolean,
        bundlerOrComment?: Bundler | string
    ) {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        const store = this.database.store;
        // TODO: clarify what's going on here
        const muid =
            typeof muidOrPosition === "object"
                ? muidOrPosition
                : muidTupleToMuid(
                      Array.from(
                          (
                              await store.getOrderedEntries(
                                  this.address,
                                  muidOrPosition
                              )
                          ).values()
                      ).pop().entryId
                  );
        ensure(muid.timestamp && muid.medallion && muid.offset);
        await movementHelper(
            bundler,
            muid,
            this.address,
            await this.findDest(dest),
            purge
        );
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }

    async reset(args?: {
        toTime?: AsOf;
        bundlerOrComment?: Bundler | string;
        skipProperties?: boolean;
        recurse?: boolean;
        seen?: Set<string>;
    }): Promise<void> {
        const toTime = args?.toTime;
        const bundlerOrComment = args?.bundlerOrComment;
        const skipProperties = args?.skipProperties;
        const recurse = args?.recurse;
        const seen = recurse ? (args?.seen ?? new Set()) : undefined;
        if (seen) {
            seen.add(muidToString(this.address));
        }
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, bundler);
        } else {
            const entriesThen = await this.database.store.getOrderedEntries(
                this.address,
                Infinity,
                toTime
            );
            // Need something subscriptable to compare by position
            const entriesNow = await this.database.store.getOrderedEntries(
                this.address,
                Infinity
            );

            for (const [key, entry] of entriesThen) {
                const placementTupleThen = entry.placementId;
                const placementNow = await this.database.store.getLocation(
                    muidTupleToMuid(entry.entryId)
                );
                const placementTupleNow = placementNow
                    ? placementNow.placement
                    : undefined;

                if (!placementNow) {
                    // This entry existed then, but has since been deleted
                    // Need to re-add it to the previous location
                    const entryBuilder = new EntryBuilder();
                    entryBuilder.setContainer(muidToBuilder(this.address));
                    entryBuilder.setKey(wrapKey(placementTupleThen[0]));
                    entryBuilder.setBehavior(entry.behavior);
                    if (entry.value !== undefined) {
                        entryBuilder.setValue(wrapValue(entry.value));
                    }

                    if (entry.pointeeList.length > 0) {
                        const pointeeMuid = muidTupleToMuid(
                            entry.pointeeList[0]
                        );
                        entryBuilder.setPointee(muidToBuilder(pointeeMuid));
                    }
                    const changeBuilder = new ChangeBuilder();
                    changeBuilder.setEntry(entryBuilder);
                    bundler.addChange(changeBuilder);
                } else {
                    if (
                        placementTupleNow &&
                        placementTupleThen[0] !== placementTupleNow[0]
                    ) {
                        // This entry exists, but has been moved
                        // Need to move it back
                        await movementHelper(
                            bundler,
                            muidTupleToMuid(entry.entryId),
                            this.address,
                            placementTupleThen[0],
                            false
                        );
                    }
                    // Need to remove the current entry from entriesNow if
                    // 1) the entry exists but was moved, or 2) the entry is untouched
                    ensure(
                        entriesNow.delete(
                            `${placementTupleNow[0]},${muidTupleToString(entry.entryId)}`
                        ),
                        "entry not found in entriesNow"
                    );
                }
                // Finally, if the previous entry was a container, recusively reset it
                if (seen && entry.pointeeList.length > 0) {
                    const pointeeMuid = muidTupleToMuid(entry.pointeeList[0]);
                    if (!seen.has(muidToString(pointeeMuid))) {
                        const container = await construct(
                            this.database,
                            pointeeMuid
                        );
                        await container.reset({
                            toTime,
                            bundlerOrComment: bundler,
                            skipProperties,
                            recurse,
                            seen,
                        });
                    }
                }
            }
            // We will need to loop through the remaining entries in entriesNow
            // to delete them, since we know they weren't in the sequence at toTime
            for (const [key, entry] of entriesNow) {
                await movementHelper(
                    bundler,
                    muidTupleToMuid(entry.entryId),
                    this.address,
                    undefined,
                    false
                );
            }
        }
        if (!skipProperties) {
            await this.database.resetContainerProperties(this, toTime, bundler);
        }
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }

    private async findDest(dest: number): Promise<number> {
        if (dest === 0 || dest === -1) {
            const currentFrontOrBack = <number>(
                (await this.getEntryAt(dest)).storageKey
            );
            return (
                currentFrontOrBack -
                Math.sign(dest + 0.5) * Math.floor(1e3 * Math.random())
            );
        }
        if (dest > +1e6) return dest;
        if (dest < -1e6) return generateTimestamp() + dest;
        const entryMap = await this.database.store.getOrderedEntries(
            this.address,
            dest
        );
        const entryArray = Array.from(entryMap.entries());
        const a = entryArray[entryArray.length - 2];
        const b = entryArray[entryArray.length - 1];
        const aTs = Number.parseInt(a[0].split(",")[0]);
        const bTs = Number.parseInt(b[0].split(",")[0]);
        if (Math.abs(aTs - bTs) < 2)
            throw new Error("can't find space between entries");
        return Math.floor((aTs + bTs) / 2);
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immediately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param what - position or Muid, defaults to last
     * @param purge - If true, removes so data cannot be recovered with "asOf" query
     * @param bundlerOrComment
     */
    async pop(
        what?: Muid | number,
        purge?: boolean,
        bundlerOrComment?: Bundler | string
    ): Promise<Container | Value | undefined> {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        let returning: Container | Value;
        let muid: Muid;
        if (what && typeof what === "object") {
            muid = what;
            const entry = await this.database.store.getEntryById(muid);
            if (!entry) return undefined;
            ensure(
                entry.entryId[0] === muid.timestamp &&
                    entry.entryId[2] === muid.offset
            );
            returning = await interpret(entry, this.database);
        } else {
            what = typeof what === "number" ? what : -1;
            // Should probably change the implementation to not copy all intermediate entries into memory.
            const entries = Array.from(
                (
                    await this.database.store.getOrderedEntries(
                        this.address,
                        what
                    )
                ).values()
            );
            if (entries.length === 0) return undefined;
            const entry = entries[entries.length - 1];
            returning = await interpret(entry, this.database);
            muid = muidTupleToMuid(entry.entryId);
        }
        await movementHelper(bundler, muid, this.address, undefined, purge);
        if (immediate) {
            await this.database.addBundler(bundler);
        }
        return returning;
    }

    /**
     * Alias for this.pop(0, purge, bundlerOrComment)
     */
    async shift(
        purge?: boolean,
        bundlerOrComment?: Bundler | string
    ): Promise<Container | Value | undefined> {
        return await this.pop(0, purge, bundlerOrComment);
    }

    /**
     * Adds multiple entries into this sequence.
     * NOTE: If you pass a bundler, all changes will share the same timestamp. This means you will
     * not be able to move new entries in between these (you may move these entries between one another).
     * Without a bundler, each item from the iterable will be committed separately, which will be costly,
     * but there won't be the same restrictions on moving.
     * @param iterable An iterable of stuff to add to the sequence.
     * @param bundlerOrComment A bundler or comment for these changes
     */
    async extend(
        iterable: Iterable<Value | Container>,
        bundlerOrComment?: Bundler | string
    ): Promise<void> {
        for (const value of iterable) {
            await this.push(value, bundlerOrComment);
        }
    }

    private async getEntryAt(
        position: number,
        asOf?: AsOf
    ): Promise<Entry | undefined> {
        //TODO add a store method to only return the entry at a given location
        const entries = await this.database.store.getOrderedEntries(
            this.address,
            position,
            asOf
        );
        if (entries.size === 0) return undefined;
        if (position >= 0 && position >= entries.size) return undefined;
        if (position < 0 && Math.abs(position) > entries.size) return undefined;
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
    async at(
        position: number,
        asOf?: AsOf
    ): Promise<Container | Value | undefined> {
        if (typeof position === "number") {
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
    async toArray(
        through = Infinity,
        asOf?: AsOf
    ): Promise<(Container | Value)[]> {
        const thisList = this;
        const entries = await thisList.database.store.getOrderedEntries(
            thisList.address,
            through,
            asOf
        );
        const applied = Array.from(entries.values());
        return await Promise.all(
            applied.map(async function (
                entry: Entry
            ): Promise<Container | Value> {
                return await interpret(entry, thisList.database);
            })
        );
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getOrderedEntries(
            this.address,
            Infinity,
            asOf
        );
        return entries.size;
    }

    /**
     * Function to iterate over the contents of the List, showing the address of each entry (which can be used in pop).
     * @param through count of many things to iterate through, positive starting from front, negative for end
     * @param asOf effective time to get the contents for
     * @returns an async iterator across everything in the list, with values returned being pairs of Muid, (Value|Container),
     */
    entries(
        through = Infinity,
        asOf?: AsOf
    ): AsyncGenerator<[Muid, Value | Container], void, unknown> {
        const thisList = this;
        return (async function* () {
            // Note: I'm loading all entries memory despite using an async generator due to shitty IndexedDb
            // behavior of closing transactions when you await on something else.  Hopefully they'll fix that in
            // the future and I can improve this.  Alternative, it might make sense to hydrate everything in a single pass.
            const entries = await thisList.database.store.getOrderedEntries(
                thisList.address,
                through,
                asOf
            );
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
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string> {
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
            returning += await toJson(
                value,
                indent === false ? false : +indent + 1,
                asOf,
                seen
            );
        }
        returning += "]";
        return returning;
    }
}
