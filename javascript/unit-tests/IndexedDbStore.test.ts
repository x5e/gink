import { testStore } from "./Store.test";
import {
    Database,
    IndexedDbStore,
    generateTimestamp,
    ensure,
    Directory,
} from "../implementation";

testStore("IndexedDbStore", async () => new IndexedDbStore("IDB.test", true));
export const result = 1;

it("use methods", async () => {
    const store = new IndexedDbStore("IndexedDbStore.test.1");
    const database = new Database({ store });
    await database.ready;
    const dir = Directory.get(database);
    await dir.set("foo", "bar");
    const beforeSecondSet = generateTimestamp();
    await dir.set("foo", "baz");
    const entries = await store.getAllEntries();
    ensure(entries.length === 2);
    const removals = await store.getAllRemovals();
    ensure(removals.length === 1);
    await store.dropHistory();
    const entriesAfterDrop = await store.getAllEntryKeys();
    ensure(entriesAfterDrop.length === 1);
    ensure(!(await dir.has("foo", beforeSecondSet)));
});
