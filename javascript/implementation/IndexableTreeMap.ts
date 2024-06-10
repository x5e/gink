import { TreeMap } from "jstreemap";

class Index extends TreeMap<any, any> {
    private keyPath: string[];

    constructor(keyPath?: string[]) {
        super();
        this.keyPath = keyPath;
    }

    getKeyPath(): string[] {
        return this.keyPath;
    }

}

export class IndexableTreeMap extends Index {
    private indexes: Map<string, Index>;
    constructor() {
        super();
        this.indexes = new Map();
    }

    setForAllIndexes(key: any, value: any) {
        this.set(key, value);
        for (const index of this.indexes.values()) {
            let newKey = '';
            for (const key of index.getKeyPath()) {
                newKey = newKey + `${value[key]},`;
            }
            newKey = newKey.slice(0, newKey.length - 1);
            index.set(newKey, value);
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
            let newKey = '';
            for (const key of keyPath) {
                newKey = newKey + `${e[key]},`;
            }
            newKey = newKey.slice(0, newKey.length - 1);
            index.set(newKey, e);
        });
        this.indexes.set(name, index);
    }

    dropIndex(name: string): void {
        this.indexes.delete(name);
    }
}
