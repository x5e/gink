import { Container } from "./Container";
import { Value, Muid, ScalarKey, AsOf, StorageKey } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, isMuidTuple, muidToString, muidTupleToMuid, valueToJson } from "./utils";
import { interpret, construct } from "./factories";
import { Addressable } from "./Addressable";
import { storageKeyToString } from "./store_utils";

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
        change?: Bundler | string
    ): Promise<Muid> {
        return this.addEntry(key, value, change);
    }

    /**
     * Adds a deletion marker (tombstone) for a particular key in the directory.
     * The corresponding value will be seen to be unset in the data model.
     * @param key
     * @param change an optional bundler to put this in.
     * @returns a promise that resolves to the address of the newly created deletion entry
     */
    async delete(key: GenericType, change?: Bundler | string): Promise<Muid> {
        return await this.addEntry(key, Container.DELETION, change);
    }

    /**
     * Returns a promise that resolves to the most recent value set for the given key, or undefined.
     * @param key
     * @param asOf
     * @returns undefined, a basic value, or a container
     */
    async get(
        key: GenericType,
        asOf?: AsOf
    ): Promise<Container | Value | undefined> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf
        );
        return interpret(entry, this.database);
    }

    async size(asOf?: AsOf): Promise<number> {
        const entries = await this.database.store.getKeyedEntries(
            this.address,
            asOf
        );
        return entries.size;
    }

    async has(key: GenericType, asOf?: AsOf): Promise<boolean> {
        const result = await this.database.store.getEntryByKey(
            this.address,
            key,
            asOf
        );
        if (result !== undefined && result.deletion) {
            return false;
        }
        return result !== undefined;
    }

    async reset(
        toTime?: AsOf,
        bundlerOrComment?: Bundler | string
    ): Promise<void> {
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, bundlerOrComment);
        } else {
            let bundler: Bundler;
            let immediate = true;
            if (typeof bundlerOrComment === "string") {
                bundler = new Bundler(bundlerOrComment);
            } else if (bundlerOrComment instanceof Bundler) {
                immediate = false;
                bundler = bundlerOrComment;
            } else {
                bundler = new Bundler();
            }
            const thenMap = await this.toMap(toTime);
            const nowMap = await this.toMap();
            // For the entries we currently have, either delete them or update their value
            for (const [keyNow, valueNow] of nowMap.entries()) {
                const genericKeyNow = this.storageKeyToGeneric(keyNow);

                const valueThen = thenMap.get(keyNow);
                if (valueThen !== valueNow) {
                    if (valueThen === undefined) {
                        await this.addEntry(genericKeyNow, Container.DELETION, bundler);
                    } else {
                        await this.addEntry(genericKeyNow, valueThen, bundler);
                        // Done processing this key in the thenMap
                        ensure(thenMap.delete(keyNow), "failed to delete?");
                    }
                }
            }
            // Now add new entries for those that were there at toTime, but not now
            // thenMap will be smaller since the entries there now have been removed.
            for (const [keyThen, valueThen] of thenMap.entries()) {
                const genericKeyThen = this.storageKeyToGeneric(keyThen);
                await this.addEntry(genericKeyThen, valueThen, bundler);
            }
            if (immediate) {
                await this.database.addBundler(bundler);
            }
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
            asOf
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
        seen?: Set<string>
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
                        muidTupleToMuid(entry.pointeeList[0])
                    )
                ).toJson(indent === false ? false : +indent + 1, asOf, seen);
            } else {
                throw new Error(`don't know how to interpret: ${entry}`);
            }
        }
        returning += "}";
        return returning;
    }

    /**
     * Converts a storage key (which is the key used in EntryBuilders) to a
     * GenericType, which is what Keyed Containers use to add and remove entries.
     * @param storageKey
     * @returns
     */
    private storageKeyToGeneric(storageKey: StorageKey): ScalarKey | Addressable | [Addressable, Addressable] {
        let newKey: ScalarKey | Addressable | [Addressable, Addressable];
        if (Array.isArray(storageKey)) {
            if (storageKey.length === 3) {
                newKey = new Addressable(muidTupleToMuid(storageKey));
            } else if (storageKey.length === 2) {
                newKey = [new Addressable(muidTupleToMuid(storageKey[0])), new Addressable(muidTupleToMuid(storageKey[1]))];
            } else {
                throw new Error("Invalid key length?");
            }
        }
        else {
            newKey = storageKey;
        }
        return newKey;
    }
}
