import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf, MuidTuple, Meta, Bundler } from "./typedefs";
import { ensure, muidToString, fromStorageKey } from "./utils";
import { toJson, interpret } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class Group extends Container {
    private constructor(database: Database, address: Muid) {
        super(database, address, Behavior.GROUP);
    }

    static get(database?: Database, muid?: Muid): Group {
        database = database || Database.recent;
        if (!muid) {
            muid = { timestamp: -1, medallion: -1, offset: Behavior.GROUP };
        }
        return new Group(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Group> {
        database = database || Database.recent;
        const muid = await Container.addContainer({
            behavior: Behavior.GROUP,
            database,
            meta,
        });
        return new Group(database, muid);
    }

    /**
     * Includes a Muid or Container in the group.
     * @param key either a container or a Muid to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(key: Container, meta?: Meta): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, meta);
    }

    /**
     * Excludes a Muid or Container from the group.
     * @param key either a Muid or container to exclude
     * @param change an optional bundler to put this in
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(key: Container, meta?: Meta): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, meta);
    }

    /**
     * This returns the number of inclusions only, NOT exclusions.
     * @returns how many containers are included in the group
     */
    async size(): Promise<number> {
        return (await this.includedAsArray()).length;
    }

    /**
     * Whether or not the given key is explicitly included in the group.
     * @param key either a Muid or container to check if it is included
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean stating whether the key is explicitly included
     */
    async isIncluded(key: Muid | Container, asOf?: AsOf): Promise<boolean> {
        if ("address" in key) {
            key = key.address;
        }
        const entry = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf,
        );
        if (entry && !entry.deletion) {
            return true;
        }
        return false;
    }

    /**
     * Function to iterate over the containers in the group.
     * @param asOf optional timestamp to look back to
     * @returns an async iterator across all containers in the group
     */
    getMembers(asOf?: AsOf): AsyncGenerator<Container, void, unknown> {
        const thisGroup = this;
        let container;
        return (async function* () {
            const entries = await thisGroup.database.store.getKeyedEntries(
                thisGroup.address,
                asOf,
            );
            for (const [key, entry] of entries) {
                container = await interpret(entry, thisGroup.database);
                if ("behavior" in container) {
                    yield container;
                }
            }
        })();
    }

    /**
     * Dumps the contents of this group to a javascript array.Only includes explicitly included members.
     * useful for debugging and could also be used to export data by walking the tree
     * @param asOf effective time to get the dump for: leave undefined to get data as of the present
     * @returns an array containing Values (e.g. numbers, strings) and Containers (e.g. other Lists, Boxes, Directories)
     */
    async includedAsArray(asOf?: AsOf): Promise<Container[]> {
        const thisList = this;
        let toArray: Array<Container> = [];
        let container;
        const entries = await thisList.database.store.getKeyedEntries(
            thisList.address,
            asOf,
        );
        for (const [key, entry] of entries) {
            container = await interpret(entry, thisList.database);
            if ("behavior" in container) {
                toArray.push(container);
            } else {
                throw Error(
                    "All entries should be containers - something is broken",
                );
            }
        }
        return toArray;
    }

    async reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void> {
        if (recurse) throw new Error("recurse not implemented for Group");
        const bundler: Bundler = await this.database.startBundle(meta);
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, { bundler });
        } else {
            const union = new Set<MuidTuple>();
            const entriesThen = await this.database.store.getKeyedEntries(
                this.address,
                toTime,
            );
            const entriesNow = await this.database.store.getKeyedEntries(
                this.address,
            );

            for (const [key, entry] of entriesThen) {
                const storageKey = <MuidTuple>entry.storageKey;
                union.add(storageKey);
            }
            for (const [key, entry] of entriesNow) {
                const storageKey = <MuidTuple>entry.storageKey;
                union.add(storageKey);
            }
            for (const key of union) {
                const genericKey = fromStorageKey(key);
                const thenEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                    toTime,
                );
                const nowEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                );
                ensure(nowEntry || thenEntry, "both then and now undefined?");
                if (!nowEntry) {
                    // This key was present then, but not now, so we need to add it back
                    ensure(thenEntry, "missing then entry?");
                    await this.addEntry(genericKey, thenEntry.value, {
                        bundler,
                    });
                } else if (!thenEntry) {
                    // This key is present now, but not then, so we need to delete it
                    ensure(nowEntry, "missing now entry?");
                    await this.addEntry(genericKey, Container.DELETION, {
                        bundler,
                    });
                } else if (nowEntry.deletion !== thenEntry.deletion) {
                    if (nowEntry.deletion) {
                        // Present then, deleted now. Need to revive.
                        await this.addEntry(genericKey, Container.INCLUSION, {
                            bundler,
                        });
                    } else if (thenEntry.deletion) {
                        // Present now, deleted then. Need to delete.
                        await this.addEntry(genericKey, Container.DELETION, {
                            bundler,
                        });
                    }
                } else {
                    ensure(
                        nowEntry.deletion === thenEntry.deletion,
                        "last case should be same entry",
                    );
                }
            }
        }
        if (!meta?.bundler) {
            await bundler.commit();
        }
    }

    /**
     * Generates a JSON representation of the data in the group.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print (not yet implemented)
     * @param asOf optional timestamp to look back to
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>,
    ): Promise<string> {
        //TODO(https://github.com/google/gink/issues/62): add indentation
        ensure(indent === false, "indent not implemented");
        if (seen === undefined) seen = new Set();
        const mySig = muidToString(this.address);
        if (seen.has(mySig)) return "null";
        seen.add(mySig);
        const asArray = await this.includedAsArray(asOf);
        let returning = "[";
        let first = true;
        for (const container of asArray) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += await toJson(
                container,
                indent === false ? false : +indent + 1,
                asOf,
                seen,
            );
        }
        returning += "]";
        return returning;
    }
}
