import { GinkInstance, LogBackedStore } from "../implementation/main";
import { testStore } from "./Store.test";
import { truncateSync, existsSync } from "fs";

const TEST_FILE = "/tmp/test.store";

function createMaker(reset: boolean) {
    return async function () {
        if (reset && existsSync(TEST_FILE)) {
            truncateSync(TEST_FILE);
        }
        const new_store = new LogBackedStore(TEST_FILE, true);
        await new_store.ready;
        return new_store;
    };
}


testStore('LogBackedStore',
    createMaker(true),
    createMaker(false),
);


it('test locks', async () => {
    const TEST_FILE_FOR_LOCKS = "/tmp/test_file_for_locks.store";
    const lbs1 = new LogBackedStore(TEST_FILE_FOR_LOCKS, true);
    await lbs1.ready;
    const lbs2 = new LogBackedStore(TEST_FILE_FOR_LOCKS, true);
    let result = "unknown";
    await lbs2.ready.then(() => {
        result = "acquired";
    }).catch(() => {
        result = "barfed";
    });
    if (result != "barfed") {
        throw new Error("locking broken");
    }
    await lbs1.close();
});

it('test two stores automatically pulling new data', async () => {
    const store1 = new LogBackedStore("/tmp/basic_test.store");
    const store2 = new LogBackedStore("/tmp/basic_test.store");

    const instance1 = new GinkInstance(store1);
    const instance2 = new GinkInstance(store1);
    await instance1.ready;
    await instance2.ready;

    const globalDir1 = instance1.getGlobalDirectory();

    await globalDir1.set("key", "value");

    expect((await store2.getAllEntries()).length).toBeTruthy();

    await store1.close();
    await store2.close();
});
