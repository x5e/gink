import { LogBackedStore } from "../implementation/main";
import { testStore } from "./Store.test";

const TEST_FILE = "/tmp/test.store";

testStore('LogBackedStore',
    async () => new LogBackedStore(TEST_FILE, true),
    async () => new LogBackedStore(TEST_FILE, false)
);


it('test locks', async () => {
    const TEST_FILE_FOR_LOCKS = "/tmp/test_file_for_locks.store";
    const lbs1 = new LogBackedStore(TEST_FILE_FOR_LOCKS);
    await lbs1.ready;
    const lbs2 = new LogBackedStore(TEST_FILE_FOR_LOCKS);
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
})
