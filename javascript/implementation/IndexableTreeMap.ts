import { MapIterator, TreeMap } from "jstreemap";
import { ensure } from "./utils";

class Index extends TreeMap<any, any> {
    private keyPath: string[];

    constructor(keyPath?: string[]) {
        super();
        this.keyPath = keyPath;
    }

    getKeyPath(): string[] {
        return this.keyPath;
    }

    put(value: any): void {
        ensure(this.keyPath.length, "need a keypath to use put");
        let newKey = '';
        for (const key of this.keyPath) {
            newKey = newKey + `${value[key].toString()},`;
        }
        newKey = newKey.slice(0, newKey.length - 1);
        this.set(newKey, value);
    }

    toLastWithPrefixBeforeSuffix<V>(
        prefix: string, suffix: string = '~'):
        MapIterator<string, V> | undefined {
        const iterator = this.upperBound(prefix + suffix);
        iterator.prev();
        if (!iterator.key) return undefined;
        if (!iterator.key.startsWith(prefix)) return undefined;
        return iterator;
    }

}

export class IndexableTreeMap extends Index {
    private indexes: Map<string, Index>;
    /**
     *
     * @param keyPath optional keyPath for the primary index. If this is passed,
     * you can use thisITM.put(value). Otherwise, you will need to specify a key to
     * setForAllIndexes().
     */
    constructor(keyPath?: string[]) {
        super(keyPath);
        this.indexes = new Map();
    }

    setForAllIndexes(value: any, key?: any) {
        key ? this.set(key, value) : this.put(value);
        for (const index of this.indexes.values()) {
            index.put(value);
        }
    }

    useIndex(name: string): Index {
        const index = this.indexes.get(name);
        if (!index) throw new Error("index does not exist");
        return index;
    }

    addIndex(name: string, keyPath: string[]): void {
        const index = new Index(keyPath);
        this.forEach((e) => {
            index.put(e);
        });
        this.indexes.set(name, index);
    }

    dropIndex(name: string): void {
        this.indexes.delete(name);
    }
}
