import { Entry, MapIterator, TreeMap } from "jstreemap";
import { ensure, muidToString, muidTupleToString } from "./utils";
import { storageKeyToString } from "./store_utils";


/**
 * Essentially just a TreeMap that converts user keys to strings.
 * Note: Keys are completely unique. Setting the same key twice will
 * overwrite the current entry with that key or throw an error (put/add).
 */
export class Index<K, V> {
    private treeMap: TreeMap<string, V>;
    private keyPath: string[];
    private isPrimary: boolean;

    /**
     * @param keyPath required keyPath to use to create the keys for entries.
     * @param primary a boolean stating whether this will be a primary index.
     * If this is a primary index, a keyPath is not required. This allows for
     * the primary index to be used like a regular treemap.
     */
    constructor(keyPath?: string[], isPrimary: boolean = false) {
        this.isPrimary = isPrimary;
        if (!this.isPrimary) {
            ensure(keyPath, "need a keypath to use a secondary index");
        }
        this.treeMap = new TreeMap();
        this.keyPath = keyPath;
    }

    getKeyPath(): string[] {
        return this.keyPath;
    }

    get(key: K): V {
        return this.treeMap.get(key.toString());
    }

    /**
     * Puts an item in the TreeMap. Replaces any item with the same key.
     * @param value an Object to put in the tree map.
     * @param key optional key to set the value to. If key is left out, the index
     * will assume the key from the keyPath and properties of the Object value.
     * If key is left out, the value does not have properties, or this index does not
     * have a keyPath, it throws an error.
     */
    put(value: V, key?: K): void {
        if (!key && this.keyPath.length && !(Object.getPrototypeOf(value) == Object.prototype)) {
            throw new Error("Cannot put non-object values into an index with a keyPath.");
        }
        let newKey: string = '';
        if (key) newKey = key.toString();
        else {
            newKey = this.valueToKey(value);
        }
        this.treeMap.set(newKey, value);
    }

    /**
     * Puts an item in the TreeMap. Throws an error if an entry with the same key is present.
     * @param value an Object to put in the tree map.
     * @param key optional key to set the value to. If key is left out, the index
     * will assume the key from the keyPath and properties of the Object value.
     * If key is left out, the value does not have properties, or this index does not
     * have a keyPath, it throws an error.
     */
    add(value: V, key?: K) {
        if (this.keyPath.length && !(Object.getPrototypeOf(value) == Object.prototype)) {
            throw new Error("Cannot put non-object values into an index with a keyPath.");
        }
        let newKey: string = '';
        if (key) newKey = key.toString();
        else {
            newKey = this.valueToKey(value);
        }
        if (this.treeMap.get(newKey)) throw new Error("Key already exists. Use put if you want to overwrite.");
        this.treeMap.set(newKey, value);
    }

    valueToKey(value: V): string {
        let newKey = '';
        for (const key of this.keyPath) {
            const prop = value[key];
            let part = prop;
            if (prop instanceof Uint8Array ||
                (Array.isArray(prop)) ||
                typeof (prop) == "number" ||
                typeof (prop) == "string"
            ) {
                part = storageKeyToString(<any>prop);
            } else {
                part = part.toString();
            }

            newKey = newKey + `${part},`;
        }
        newKey = newKey.slice(0, newKey.length - 1);
        return newKey;
    }

    erase(it: MapIterator<string, V>) {
        this.treeMap.erase(it);
    }

    delete(key: K) {
        this.treeMap.delete(key.toString());
    }

    deleteByValue(value: V) {
        this.treeMap.delete(this.valueToKey(value));
    }

    upperBound(key: K) {
        return this.treeMap.upperBound(key.toString());
    }

    lowerBound(key: K) {
        return this.treeMap.lowerBound(key.toString());
    }

    begin() {
        return this.treeMap.begin();
    }

    end() {
        return this.treeMap.end();
    }

    values(): IterableIterator<V> {
        return this.treeMap.values();
    }

    keys(): IterableIterator<string> {
        return this.treeMap.keys();
    }

    forEach(callback: (element: Entry<string, V>) => void) {
        return this.treeMap.forEach(callback);
    }

    /**
     * Finds the last entry with the prefix, but before the suffix. If no suffix is provided,
     * finds the last entry with the prefix. The prefix and suffix are parts of the keyPath.
     * @param prefix beginning part of keyPath
     * @param suffix optional second part of keyPath. Leave blank to get all entries with the prefix.
     * @returns a MapIterator starting at the entry if an entry matching the prefix/suffix exists,
     * otherwise returns undefined.
     */
    toLastWithPrefixBeforeSuffix(prefix: string, suffix: string = '~'): MapIterator<string, V> {
        const iterator = this.upperBound(<K>(prefix + suffix));
        iterator.prev();
        if (!iterator.key) return undefined;
        if (!iterator.key.startsWith(prefix)) return undefined;
        return iterator;
    }

}


/**
 * At least for now, the IndexableTreeMap can only use string keys. This means a keyPath is required, and keys
 * will always be inferred from the keyPath of the object being added.
 */
export class IndexableTreeMap<K, V> {
    private primary: Index<K, V>;
    private indexes: Map<string, Index<K, V>>;

    /**
     * @param keyPath keyPath for the primary index.
     */
    constructor(keyPath?: string[]) {
        this.primary = new Index(keyPath, true);
        this.indexes = new Map();
    }

    /**
     * Sets a key, value pair in all indexes by getting the key from each index's keyPath.
     * If the key is already present, overwrites it.
     * For the secondary indexes, the key will be inferred from the keyPath of the
     * index and the value. If no key argument is present, the primary index will also
     * use its keyPath.
     * @param value
     * @param key optional key to set the value to. If key is left out, the index
     * will assume the key from the keyPath and properties of the Object value.
     * If key is left out, the value does not have properties, or this index does not
     * have a keyPath, it throws an error.
     */
    put(value: V, key?: K) {
        this.primary.put(value, key);
        for (const index of this.indexes.values()) {
            index.put(value, key);
        }
    }

    /**
     * Sets a key, value pair in all indexes by getting the key from each index's keyPath.
     * If the key is already present, throws an error.
     * For the secondary indexes, the key will be inferred from the keyPath of the
     * index and the value. If no key argument is present, the primary index will also
     * use its keyPath.
     * @param value
     * @param key optional key to set the value to. If key is left out, the index
     * will assume the key from the keyPath and properties of the Object value.
     * If key is left out, the value does not have properties, or this index does not
     * have a keyPath, it throws an error.
     */
    add(value: V, key?: K) {
        this.primary.add(value, key);
        for (const index of this.indexes.values()) {
            index.add(value, key);
        }
    }

    /**
     * Deletes the value associated with a particular key in all indexes.
     * @param key The key to be deleted.
     * @returns Either the found Object or undefined.
     */
    delete(key: K) {
        this.primary.delete(key);
        for (const index of this.indexes.values()) {
            index.delete(key);
        }
    }

    erase(it: MapIterator<string, V>) {
        this.primary.erase(it);
        for (const index of this.indexes.values()) {
            index.deleteByValue(it.value);
        }

    }

    /**
     * Get the value associated with a particular key on the PRIMARY INDEX.
     * @param key
     * @returns Either the found Object or undefined.
     */
    get(key: K): V {
        return this.primary.get(key);
    }


    values(): IterableIterator<V> {
        return this.primary.values();
    }

    keys(): IterableIterator<string> {
        return this.primary.keys();
    }

    /**
     * Returns a map iterator at the entry AFTER the last found entry matching the key.
     * @param key string key to search.
     * @returns a MapIterator
     */
    upperBound(key: K): MapIterator<string, V> {
        return this.primary.upperBound(key);
    }

    /**
     * Returns an array of map iterators at the first found entry matching the key for each index.
     * @param key string key to search.
     * @returns an array of MapIterator
     */
    lowerBound(key: K): MapIterator<string, V> {
        return this.primary.lowerBound(key);
    }

    /**
     * Note: This operation will be performed on the primary index.
     * Finds the last entry with the prefix, but before the suffix. If no suffix is provided,
     * finds the last entry with the prefix. The prefix and suffix are parts of the keyPath.
     * @param prefix beginning part of keyPath
     * @param suffix optional second part of keyPath. Leave blank to get all entries with the prefix.
     * @returns a MapIterator starting at the entry if an entry matching the prefix/suffix exists,
     * otherwise returns undefined.
     */
    toLastWithPrefixBeforeSuffix(prefix: string, suffix?: string): MapIterator<string, V> {
        return this.primary.toLastWithPrefixBeforeSuffix(prefix, suffix);
    }

    /**
     * Returns the index registered with this name - you can chain
     * a query by using this.useIndex(name).get(key)
     * @param name name of the index
     * @returns an Index (which inherits from TreeMap) to perform queries on.
     */
    useIndex(name: string): Index<K, V> {
        const index = this.indexes.get(name);
        if (!index) throw new Error("index does not exist");
        return index;
    }

    /**
     * Creates and returns a new index on the given keyPath.
     * @param name the name to refer to this index
     * @param keyPath the properties of the value to be used in the key.
     * For example, if the value is a Muid: {
     *  timestamp: 1234,
     *  medallion: 5555,
     *  offset: 1
     * }
     * and the provided keyPath was ["medallion", "offset"],
     * the keys for the index would be "5555,1"
     * @returns the created Index (basically a TreeMap)
     */
    createIndex(name: string, keyPath: string[]): Index<K, V> {
        const index: Index<K, V> = new Index(keyPath);
        this.primary.forEach((e) => {
            index.put(<V>e);
        });
        this.indexes.set(name, index);
        return index;
    }

    /**
     * Removes an index.
     * @param name the name of the index to remove
     */
    dropIndex(name: string): void {
        this.indexes.delete(name);
    }

    /**
     * @returns the first entry in the primary index.
     */
    begin() {
        return this.primary.begin();
    }

    /**
     * @returns the last entry in the primary index.
     */
    end() {
        return this.primary.end();
    }
}
