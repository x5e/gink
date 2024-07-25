import { Database, LogBackedStore, ensure } from "../implementation/main";
import { sodium_ready } from "../implementation/utils";
import { testStore } from "./Store.test";
import { existsSync, unlinkSync, readFileSync } from "fs";

function createMaker(reset: boolean, testFile = "/tmp/test.store") {
    return async function () {
        if (reset && existsSync(testFile)) {
            unlinkSync(testFile);
        }
        const new_store = new LogBackedStore(testFile, true);
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
    if (existsSync(TEST_FILE_FOR_LOCKS)) {
        unlinkSync(TEST_FILE_FOR_LOCKS);
    }
    const lbs1 = new LogBackedStore(TEST_FILE_FOR_LOCKS, true);
    await lbs1.ready;
    const lbs2 = new LogBackedStore(TEST_FILE_FOR_LOCKS, true);
    let result = "unknown";
    await lbs2.ready.then(() => {
        result = "acquired";
    }).catch(() => {
        result = "barfed";
        lbs2.close();
    });
    if (result !== "barfed") {
        throw new Error("locking broken");
    }
    await lbs1.close();
});

it('test automatic data pulling & callbacks', async () => {
    const testFile = "/tmp/basic_test.store";
    if (existsSync(testFile)) {
        unlinkSync(testFile);
    }
    const store1 = new LogBackedStore(testFile);
    const store2 = new LogBackedStore(testFile);

    const cb = (bundle) => {
        cb.calledTimes++;
        return Promise.resolve();
    };
    cb.calledTimes = 0;
    store2.addFoundBundleCallBack(cb);

    const instance1 = new Database(store1);
    await instance1.ready;

    const globalDir1 = instance1.getGlobalDirectory();

    await globalDir1.set("key", "value", "test bundle");

    await new Promise(r => setTimeout(r, 100));

    expect(cb.calledTimes > 0).toBe(true);
    expect((await store2.getAllEntries()).length).toBeTruthy();

    await store1.close();
    await store2.close();
});

it('test magic', async () => {

    const fn = "/tmp/testMagic.bin";
    const store1 = await createMaker(true, fn)();

    const instance1 = new Database(store1);
    await instance1.ready;

    const globalDir1 = instance1.getGlobalDirectory();

    await globalDir1.set("key", "value");

    await store1.close();

    const contents = readFileSync(fn);
    ensure(contents[1] === 71); // G
    ensure(contents[2] === 73); // I
    ensure(contents[3] === 78); // N
    ensure(contents[4] === 75); // K

});
