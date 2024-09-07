import { isEqual } from "lodash";
import { testStore } from "./Store.test";
import {
    Database,
    IndexedDbStore,
    generateTimestamp,
    ensure,
} from "../implementation";

testStore("IndexedDbStore", async () => new IndexedDbStore("IDB.test", true));
export const result = 1;

it("use methods", async () => {
    const indexedDbStore = new IndexedDbStore("IndexedDbStore.test.1");
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
    ensure(!(await dir.has("foo", beforeSecondSet)));
});

it("getContainerProperties", async () => {
    const indexedDbStore = new IndexedDbStore("IndexedDbStore.test.2");
    const database = new Database(indexedDbStore);
    await database.ready;

    const dir = database.getGlobalDirectory();
    await dir.set("foo", "bar");

    const prop = await database.createProperty();
    await prop.set(dir, "bar");

    const prop2 = await database.createProperty();
    await prop2.set(dir, "baz");

    const box = await database.createBox();
    await prop.set(box, "box");

    const properties = await indexedDbStore.getContainerProperties(dir.address);
    console.log(properties);

    ensure(properties.length === 2);
    ensure(isEqual(properties[0], [dir.address, "bar"]));
    ensure(isEqual(properties[1], [dir.address, "baz"]));
});
