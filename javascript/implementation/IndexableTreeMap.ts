import { MapIterator, TreeMap } from "jstreemap";
import { ensure } from "./utils";


class Index<V> extends TreeMap<string, V> {
    private keyPath: string[];

    constructor(keyPath?: string[]) {
        super();
        this.keyPath = keyPath;
    }

    getKeyPath(): string[] {
        return this.keyPath;
    }

    put(value: V): void {
        ensure(this.keyPath.length, "need a keypath to use put");
        let newKey = '';
        for (const key of this.keyPath) {
            newKey = newKey + `${value[key].toString()},`;
        }
        newKey = newKey.slice(0, newKey.length - 1);
        this.set(newKey, value);
    }

    toLastWithPrefixBeforeSuffix(prefix: string, suffix: string = '~'): MapIterator<string, V> | undefined {
        const iterator = this.upperBound(prefix + suffix);
        iterator.prev();
        if (!iterator.key) return undefined;
        if (!iterator.key.startsWith(prefix)) return undefined;
        return iterator;
    }

}


export class IndexableTreeMap<V> extends Index<V> {
    private indexes: Map<string, Index<V>>;

    /**
     * Note: The type parameter V declares the type of value to be stored.
     * At least for now, the IndexableTreeMap can only use string keys.
     * @param keyPath optional keyPath for the primary index. If this is passed,
     * you can use thisITM.put(value). Otherwise, you will need to specify a key to
     * setForAllIndexes().
     */
    constructor(keyPath?: string[]) {
        super(keyPath);
        this.indexes = new Map();
    }

    /**
     * Sets a key, value pair in every index, not just the primary tree map.
     * For the secondary indexes, the key will be inferred from the keyPath of the
     * index and the value. If no key argument is present, the primary index will also
     * use its keyPath.
     * @param value
     * @param key
     */
    setForAllIndexes(value: V, key?: string) {
        key ? this.set(key, value) : this.put(value);
        for (const index of this.indexes.values()) {
            index.put(value);
        }
    }

    /**
     * Returns the index registered with this name - you can chain
     * a query by using this.useIndex(name).get(key)
     * @param name name of the index
     * @returns an Index (which inherits from TreeMap) to perform queries on.
     */
    useIndex(name: string): Index<V> {
        const index = this.indexes.get(name);
        if (!index) throw new Error("index does not exist");
        return index;
    }

    /**
     * Creates and returns a new index on the given keyPath.
     * @param name the name to refer to this index
     * @param keyPath the properties of the value to be used in the key.
     * For example, if the value is a Muid: {
     *  timestamp,
     *  medallion,
     *  offset
     * }
     * and the provided keyPath was ["medallion", "offset"],
     * the keys for the index would be "medallion,offset"
     * @returns the created Index (basically a TreeMap)
     */
    createIndex(name: string, keyPath: string[]): Index<V> {
        const index: Index<V> = new Index(keyPath);
        this.forEach((e) => {
            index.put(<V>e);
        });
        this.indexes.set(name, index);
        return index;
    }

    dropIndex(name: string): void {
        this.indexes.delete(name);
    }
}
