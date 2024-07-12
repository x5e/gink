import { testStore } from "./Store.test";
import { Database, IndexedDbStore, generateTimestamp, ensure } from "../implementation";

testStore('IndexedDbStore', async () => new IndexedDbStore("IDB.test", true));
export const result = 1;

it('use methods', async () => {
    const indexedDbStore = new IndexedDbStore('IndexedDbStore.test.1');
    const database = new Database(indexedDbStore);
    await database.ready;
    const dir = database.getGlobalDirectory();
    await dir.set("foo", "bar");
    const beforeSecondSet = generateTimestamp();
    await dir.set("foo", "baz");
    const entries = await indexedDbStore.getAllEntries();
    ensure(entries.length === 2);
    const removals = await indexedDbStore.getAllRemovals();
    ensure(removals.length === 1);
    await indexedDbStore.dropHistory();
    const entriesAfterDrop = await indexedDbStore.getAllEntryKeys();
    ensure(entriesAfterDrop.length === 1);
    ensure(!await dir.has("foo", beforeSecondSet));
});
