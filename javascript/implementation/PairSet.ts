import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf, MuidTuple } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString, fromStorageKey } from "./utils";
import { toJson } from "./factories";
import { Behavior, ContainerBuilder } from "./builders";

export class PairSet extends Container {
    constructor(
        database: Database,
        address: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.PAIR_SET);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.PAIR_SET);
        } else {
            ensure(containerBuilder.getBehavior() === Behavior.PAIR_SET);
        }
    }

    /**
     * Includes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the inclusion
     */
    async include(
        key: [Container, Container],
        change?: Bundler | string
    ): Promise<Muid> {
        return await this.addEntry(key, Container.INCLUSION, change);
    }

    /**
     * Excludes a pair of Muids or Containers in the pair set.
     * @param key a pair of either containers or Muids to include
     * @param change an optional bundler to put this change into
     * @returns a promise that resolves to the Muid for the exclusion
     */
    async exclude(
        key: [Container, Container],
        change?: Bundler | string
    ): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * If the pair set has a key or not.
     * @param key array of 2 muids or containers
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a boolean, true if the key is included, false if not
     */
    async contains(
        key: [Muid | Container, Muid | Container],
        asOf?: AsOf
    ): Promise<boolean> {
        const aKey: [Muid, Muid] = [
            key[0] instanceof Container ? key[0].address : key[0],
            key[1] instanceof Container ? key[1].address : key[1],
        ];
        const found = await this.database.store.getEntryByKey(
            this.address,
            aKey,
            asOf
        );
        if (found && found.deletion) return false;
        return Boolean(found);
    }

    /**
     *
     * @param args Optional arguments, including:
     * @argument toTime Optional time to reset to. If absent, the container will be cleared.
     * @argument bundlerOrComment Optional bundler or comment to add this change to
     * @argument skipProperties If true, do not reset properties of this container. By default,
     * all properties associated with this container will be reset to the time specified in toTime.
     * @argument recurse NOTE: THIS FLAG IS IGNORED. Recursive reset for Inclusion-based containers
     * is not yet implemented, but this arg needs to be accepted for other containers recursively
     * resetting this one.
     * @argument seen NOTE: THIS FLAG IS IGNORED. Recursive reset for Inclusion-based containers
     * is not yet implemented, but this arg needs to be accepted for other containers recursively
     * resetting this one.
     */
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
            const union = new Set<[MuidTuple, MuidTuple]>();
            const entriesThen = await this.database.store.getKeyedEntries(
                this.address,
                toTime
            );
            const entriesNow = await this.database.store.getKeyedEntries(
                this.address
            );

            for (const [key, entry] of entriesThen) {
                const storageKey = <[MuidTuple, MuidTuple]>entry.storageKey;
                union.add(storageKey);
            }
            for (const [key, entry] of entriesNow) {
                const storageKey = <[MuidTuple, MuidTuple]>entry.storageKey;
                union.add(storageKey);
            }
            for (const key of union) {
                const genericKey = fromStorageKey(key);
                const thenEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                    toTime
                );
                const nowEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey
                );
                ensure(nowEntry || thenEntry, "both then and now undefined?");
                if (!nowEntry) {
                    // This key was present then, but not now, so we need to add it back
                    ensure(thenEntry, "missing then entry?");
                    await this.addEntry(genericKey, thenEntry.value, bundler);
                } else if (!thenEntry) {
                    // This key is present now, but not then, so we need to delete it
                    ensure(nowEntry, "missing now entry?");
                    await this.addEntry(
                        genericKey,
                        Container.DELETION,
                        bundler
                    );
                } else if (nowEntry.deletion !== thenEntry.deletion) {
                    if (nowEntry.deletion) {
                        // Present then, deleted now. Need to revive.
                        await this.addEntry(
                            genericKey,
                            Container.INCLUSION,
                            bundler
                        );
                    } else if (thenEntry.deletion) {
                        // Present now, deleted then. Need to delete.
                        await this.addEntry(
                            genericKey,
                            Container.DELETION,
                            bundler
                        );
                    }
                } else {
                    ensure(
                        nowEntry.deletion === thenEntry.deletion,
                        "last case should be same entry"
                    );
                }
            }
        }
        if (!skipProperties) {
            await this.database.resetContainerProperties(this, toTime, bundler);
        }
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }

    /**
     * The number of items in the pair set.
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to the number of entries
     */
    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf
        );
        return entries.size;
    }

    /**
     * All of the pairs in the Pair Set as a set
     * @param asOf optional timestamp to look back to
     * @returns a promise that resolves to a set of pairs [Muid, Muid]
     */
    async getPairs(asOf?: AsOf): Promise<Set<Array<Muid>>> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf
        );
        const toSet = new Set<Array<Muid>>();
        for (const [key, entry] of entries) {
            if (!entry.deletion) {
                toSet.add(<Array<Muid>>entry.storageKey);
            }
        }
        return toSet;
    }

    /**
     * Generates a JSON representation of the data in the pair set.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print (not yet implemented)
     * @param asOf optional timestamp to look back to
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>
    ): Promise<string> {
        //TODO(https://github.com/google/gink/issues/62): add indentation
        ensure(indent === false, "indent not implemented");
        if (seen === undefined) seen = new Set();
        const mySig = muidToString(this.address);
        if (seen.has(mySig)) return "null";
        seen.add(mySig);
        const asSet = await this.getPairs(asOf);
        let returning = "[";
        let first = true;
        for (const key of asSet) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            returning += await toJson(
                `[${muidToString(key[0])}, ${muidToString(key[1])}]`,
                indent === false ? false : +indent + 1,
                asOf,
                seen
            );
        }
        returning += "]";
        return returning;
    }
}
