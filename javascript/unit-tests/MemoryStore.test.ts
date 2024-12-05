import { testStore } from "./Store.test";
import {
    Database,
    MemoryStore,
    generateTimestamp,
    ensure,
    Directory,
} from "../implementation";

testStore("MemoryStore", async () => new MemoryStore(true));
it("test basic operations", async () => {
    const store = new MemoryStore(true);
    const instance = new Database({store});
    await instance.ready;
    const dir = Directory.get(instance);
    await dir.set("foo", "bar");
    const beforeSecondSet = generateTimestamp();
    await dir.set("foo", "baz");
    const entries = store.getAllEntries();
    ensure(entries.length === 2);
    const removals = store.getAllRemovals();
    ensure(
        removals.size === 1,
        `removals.size is ${removals.size}, expected 1`
    );
    /*
    await memStore.dropHistory();
    const entriesAfterDrop = memStore.getAllEntryKeys();
    ensure(Array.from(entriesAfterDrop).length === 1);
    ensure(!await dir.has("foo", beforeSecondSet));
    */
});

it("tests getEntryByKey and getKeyedEntries", async () => {
    const store = new MemoryStore(true);
    const instance = new Database({store});
    await instance.ready;
    const dir = Directory.get(instance);
    const id = await dir.set("foo", "bar");
    await dir.set("bar", "foo");
    ensure((await store.getKeyedEntries(dir.address)).size === 2);
});
