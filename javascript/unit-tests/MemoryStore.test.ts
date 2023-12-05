import { testStore } from "./Store.test";
import { GinkInstance, MemoryStore, generateTimestamp, ensure } from "../implementation";

// testStore('MemoryStore', async () => new MemoryStore(true));
it('test basic operations', async () => {
    const memStore = new MemoryStore(true);
    const instance = new GinkInstance(memStore);
    const dir = instance.getGlobalDirectory();
    await dir.set("foo", "bar");
    const beforeSecondSet = generateTimestamp();
    await dir.set("foo", "baz");
    const entries = memStore.getAllEntries();
    ensure(entries.size == 2);
    const removals = memStore.getAllRemovals();
    console.log(removals.size);

    // ensure(removals.size == 1);
    await memStore.dropHistory();
    const entriesAfterDrop = memStore.getAllEntryKeys();
    let counter = 0;
    for (const entry of entriesAfterDrop) {
        counter++;
    }
    // ensure(counter == 1);
    ensure(!await dir.has("foo", beforeSecondSet));
});