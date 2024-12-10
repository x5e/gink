import { Container } from "./Container";
import {
    Value,
    Muid,
    ScalarKey,
    AsOf,
    StorageKey,
    Meta,
    Bundler,
} from "./typedefs";
import {
    ensure,
    muidToString,
    muidTupleToMuid,
    fromStorageKey,
    valueToJson,
} from "./utils";
import { interpret, construct } from "./factories";
import { Addressable } from "./Addressable";
import { storageKeyToString } from "./store_utils";
import { Behavior } from "./builders";

export class Keyed<
    GenericType extends ScalarKey | Addressable | [Addressable, Addressable],
> extends Container {
    /**
     * Sets a key/value association in a directory.
     * If a bundler is supplied, the function will add the entry to that bundler
     * and return immediately (you'll need to addBundler manually in that case).
     * If the caller does not supply a bundler, then one is created on the fly, and
     * then this method will await on the bundler being added to the database instance.
     * This is to allow simple console usage like:
     *      await myDirectory.set("foo", "bar");
     * @param key
     * @param value
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created entry
     */
    set(
        key: GenericType,
        value: Value | Container,
        meta?: Meta,
    ): Promise<Muid> {
        return this.addEntry(key, value, meta);
    }

    /**
     * Adds a deletion marker (tombstone) for a particular key in the directory.
     * The corresponding value will be seen to be unset in the data model.
     * @param key
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async delete(key: GenericType, meta?: Meta): Promise<Muid> {
        return this.addEntry(key, Container.DELETION, meta);
    }

    /**
     * Returns a promise that resolves to the most recent value set for the given key, or undefined.
     * @param key
     * @param asOf
     * @returns undefined, a basic value, or a container
     */
    async get(
        key: GenericType,
        asOf?: AsOf,
    ): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf,
        );
        return interpret(entry, this.database);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf,
        );
        return entries.size;
    }

    async has(key: GenericType, asOf?: AsOf): Promise<boolean> {
        const result = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf,
        );
        if (result !== undefined && result.deletion) {
            return false;
        }
        return result !== undefined;
    }

    async reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void> {
        if (this.behavior === Behavior.PROPERTY) {
            throw new Error(
                "Cannot directly reset a property. " +
                    "Calling reset on a Container will reset its properties.",
            );
        }
        if (recurse === true) {
            recurse = new Set();
        }
        if (recurse instanceof Set) {
            recurse.add(muidToString(this.address));
        }
        const bundler: Bundler = await this.database.startBundle(meta);
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, { bundler });
        } else {
            const keys: Set<StorageKey> = new Set();
            const thenEntries = await this.database.store.getKeyedEntries(
                this.address,
                toTime,
            );
            for (const [key, entry] of thenEntries) {
                keys.add(entry.storageKey);
            }

            const nowEntries = await this.database.store.getKeyedEntries(
                this.address,
            );
            for (const [key, entry] of nowEntries) {
                keys.add(entry.storageKey);
            }

            for (const key of keys) {
                const genericKey = fromStorageKey(key);
                const thenEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                    toTime,
                );
                const thenValue: Value | Container =
                    thenEntry?.pointeeList.length > 0
                        ? await construct(
                              this.database,
                              muidTupleToMuid(thenEntry.pointeeList[0]),
                          )
                        : thenEntry?.value;

                const nowEntry = await this.database.store.getEntryByKey(
                    this.address,
                    genericKey,
                );
                const nowValue: Value | Container =
                    nowEntry?.pointeeList.length > 0
                        ? await construct(
                              this.database,
                              muidTupleToMuid(nowEntry.pointeeList[0]),
                          )
                        : nowEntry?.value;

                if (!nowEntry) {
                    // This key was present then, but not now, so we need to add it back
                    if (thenEntry && !thenEntry.deletion) {
                        ensure(
                            thenValue,
                            `missing for key: ${key}, ${JSON.stringify(genericKey)}`,
                        );
                        await this.addEntry(genericKey, thenValue, { bundler });
                    }
                } else if (!thenEntry) {
                    // This key is present now, but not then, so we need to delete it
                    ensure(nowEntry && nowValue, "missing value?");
                    await this.addEntry(genericKey, Container.DELETION, {
                        bundler,
                    });
                } else {
                    // Present both then and now. Check if the values are different
                    if (nowValue !== thenValue) {
                        // Make sure the values are not the same container
                        if (
                            !(
                                nowValue instanceof Container &&
                                thenValue instanceof Container &&
                                muidToString(nowValue.address) ===
                                    muidToString(thenValue.address)
                            )
                        ) {
                            // Update the entry
                            await this.addEntry(genericKey, thenValue, {
                                bundler,
                            });
                        }
                    }
                }
                if (
                    recurse &&
                    thenValue instanceof Container &&
                    !recurse.has(muidToString(thenValue.address))
                ) {
                    await thenValue.reset(toTime, recurse, { bundler });
                }
            }
        }

        if (!meta?.bundler) {
            await bundler.commit();
        }
    }

    /**
     * Dumps the contents of this directory into a javascript Map; mostly useful for
     * debugging though also could be used to create a backup of a database.
     * @param asOf effective time to get the dump for, or undefined for the present
     * @returns a javascript map from keys (numbers or strings) to values or containers
     */
    async toMap(asOf?: AsOf): Promise<Map<StorageKey, Value | Container>> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf,
        );
        const resultMap = new Map();
        for (const [key, entry] of entries) {
            const pointee =
                entry.pointeeList.length > 0
                    ? muidTupleToMuid(entry.pointeeList[0])
                    : undefined;
            const val =
                entry.value !== undefined
                    ? entry.value
                    : await construct(this.database, pointee);
            resultMap.set(entry.storageKey, val);
        }
        return resultMap;
    }

    /**
     * Generates a JSON representation of the data in this container.
     * Mostly intended for demo/debug purposes.
     * @param indent true to pretty print
     * @param asOf effective time
     * @param seen (internal use only! This prevents cycles from breaking things)
     * @returns a JSON string
     */
    async toJson(
        indent: number | boolean = false,
        asOf?: AsOf,
        seen?: Set<string>,
    ): Promise<string> {
        ensure(indent === false, "indent not implemented");
        if (seen === undefined) seen = new Set();
        const mySig = muidToString(this.address);
        if (seen.has(mySig)) return "null";
        seen.add(mySig);
        const asMap = await this.toMap(asOf);
        let returning = "{";
        let first = true;
        const entries = (
            await this.database.store.getKeyedEntries(this.address, asOf)
        ).values();
        for (const entry of entries) {
            if (first) {
                first = false;
            } else {
                returning += ",";
            }
            const storageKey: StorageKey = entry.storageKey;
            if (typeof storageKey === "string") {
                returning += JSON.stringify(storageKey);
            } else if (storageKey instanceof Uint8Array) {
                returning += '"' + storageKey.toString() + '"';
            } else {
                returning += JSON.stringify(storageKeyToString(storageKey));
            }
            returning += ":";
            if (entry.value !== undefined) {
                returning += valueToJson(entry.value);
            } else if (entry.pointeeList.length > 0) {
                returning += await (
                    await construct(
                        this.database,
                        muidTupleToMuid(entry.pointeeList[0]),
                    )
                ).toJson(indent === false ? false : +indent + 1, asOf, seen);
            } else {
                throw new Error(`don't know how to interpret: ${entry}`);
            }
        }
        returning += "}";
        return returning;
    }
}
