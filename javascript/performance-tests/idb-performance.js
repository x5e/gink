// const { openDB } = require('idb');

async function testWrite(count) {
    const database = await idb.openDB('test1', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    let txn = database.transaction('test-store', 'readwrite');
    let writeStore = txn.objectStore('test-store');
    console.log("Testing IDB writing performance to fresh database.");
    console.log("Writing", count, "key, value entries...");
    let writeBeforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await writeStore.put('test data to be inserted', `test${i}`);
    }
    await txn.done;
    let writeAfterTime = Date.now();
    let writeTotalTime = ((writeAfterTime - writeBeforeTime) / 1000);
    let writesPerSecond = (count / writeTotalTime);
    console.log("- Total time:", writeTotalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
    console.log();

    let read_txn = database.transaction('test-store', 'readwrite');
    let readStore = read_txn.objectStore('test-store');
    console.log("Reading", count, "key, value entries...");
    readBeforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        if (!(await readStore.get(`test${i}`))) throw new Error('data does not exist');
    }
    await read_txn.done;
    readAfterTime = Date.now();
    readTotalTime = ((readAfterTime - readBeforeTime) / 1000);
    readsPerSecond = (count / readTotalTime);
    console.log("- Total time:", readTotalTime.toFixed(4), "seconds");
    console.log("- Reads per second:", readsPerSecond.toFixed(2));
    console.log();

    const results = {
        "write": {
            "total_time": writeTotalTime,
            "writes_per_second": writesPerSecond
        },
        "read": {
            "total_time": readTotalTime,
            "reads_per_second": readsPerSecond
        }
    }
    database.close()
    return results;
}