import { LogBackedStore } from "../implementation/main";
import { testStore } from "./Store.test";
import { truncateSync } from "fs";

const TEST_FILE = "/tmp/test.store";

function createMaker(reset: boolean) {
    return async function() {
        if (reset) {
            truncateSync(TEST_FILE);
        }
        return new LogBackedStore(TEST_FILE, true);
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
