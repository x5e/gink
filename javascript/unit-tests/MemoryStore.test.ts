import { testStore } from "./Store.test";
import { Database, MemoryStore, generateTimestamp, ensure } from "../implementation";

testStore('MemoryStore', async () => new MemoryStore(true));
it('test basic operations', async () => {
    const memStore = new MemoryStore(true);
    const instance = new Database(memStore);
    await instance.ready;
    const dir = instance.getGlobalDirectory();
    await dir.set("foo", "bar");
    const beforeSecondSet = generateTimestamp();
    await dir.set("foo", "baz");
    const entries = memStore.getAllEntries();
    ensure(entries.length == 2);
    const removals = memStore.getAllRemovals();
    ensure(removals.size == 1);
    await memStore.dropHistory();
    const entriesAfterDrop = memStore.getAllEntryKeys();
    ensure(Array.from(entriesAfterDrop).length == 1);
    ensure(!await dir.has("foo", beforeSecondSet));
});

it('tests getEntryByKey and getKeyedEntries', async () => {
    const memStore = new MemoryStore(true);
    const instance = new Database(memStore);
    await instance.ready;
    const dir = instance.getGlobalDirectory();
    const id = await dir.set("foo", "bar");
    await dir.set("bar", "foo");
    ensure((await memStore.getEntryById(id)).value == "bar");
    ensure((await memStore.getKeyedEntries(dir.address)).size == 2);
});
