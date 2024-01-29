import { LogBackedStore } from "../implementation/main";
import { testStore } from "./Store.test";
import { truncateSync, existsSync } from "fs";

const TEST_FILE = "/tmp/test.store";

function createMaker(reset: boolean) {
    return async function() {
        if (reset && existsSync(TEST_FILE)) {
            truncateSync(TEST_FILE);
        }
        const new_store = new LogBackedStore(TEST_FILE, true);
        await new_store.ready;
        return new_store;
    }
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
