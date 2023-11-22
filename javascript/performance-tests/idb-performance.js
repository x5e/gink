async function testWriteFresh(count) {
    const database = await idb.openDB('write_fresh', 1, {
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

    const results = {
        "total_time": writeTotalTime,
        "writes_per_second": writesPerSecond
    }
    database.close()
    return results;
}

async function testWriteOccupied(count) {
    const database = await idb.openDB('write_occupied', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    console.log(`Testing IDB writing performance to occupied database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} entries.`)
    let txn = database.transaction('test-store', 'readwrite');
    let writeStore = txn.objectStore('test-store');
    for (let i = 0; i < count; i++) {
        await writeStore.put('test data to be inserted', `test${i}`);
    }
    await txn.done;
    console.log("Writing", count, "new key, value entries...");
    txn = database.transaction('test-store', 'readwrite');
    writeStore = txn.objectStore('test-store');
    let writeBeforeTime = Date.now();
    for (let i = count; i < count * 2; i++) {
        await writeStore.put('test data to be inserted', `test${i}`);
    }
    await txn.done;
    let writeAfterTime = Date.now();
    let writeTotalTime = ((writeAfterTime - writeBeforeTime) / 1000);
    let writesPerSecond = (count / writeTotalTime);
    console.log("- Total time:", writeTotalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
    console.log();

    const results = {
        "total_time": writeTotalTime,
        "writes_per_second": writesPerSecond
    }
    database.close()
    return results;
}

async function testRead(count) {
    const database = await idb.openDB('read', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    console.log(`Filling fresh database with ${count} entries.`)
    let txn = database.transaction('test-store', 'readwrite');
    let writeStore = txn.objectStore('test-store');
    for (let i = 0; i < count; i++) {
        await writeStore.put('test data to be inserted', `test${i}`);
    }
    await txn.done;
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
        "total_time": readTotalTime,
        "reads_per_second": readsPerSecond
    }
    database.close()
    return results;
}

async function testReadWrite(count) {
    const database = await idb.openDB('read_write', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    let txn = database.transaction('test-store', 'readwrite');
    let store = txn.objectStore('test-store');
    console.log("Testing IDB writing performance to fresh database.");
    console.log("Writing then reading", count, "key, value entries...");
    let beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await store.put('test data to be inserted', `test${i}`);
        if (!(await store.get(`test${i}`))) throw new Error('data does not exist');
    }
    await txn.done;
    let afterTime = Date.now();
    let txnTotalTime = ((afterTime - beforeTime) / 1000);
    let txnsPerSecond = (count / txnTotalTime);
    console.log("- Total time:", txnTotalTime.toFixed(4), "seconds");
    console.log("- Transactions per second:", txnsPerSecond.toFixed(2));
    console.log();

    const results = {
        "total_time": txnTotalTime,
        "txns_per_second": txnsPerSecond
    }
    database.close()
    return results;
}

async function testDelete(count) {
    const database = await idb.openDB('delete', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    console.log(`Testing IDB deletion performance to database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} entries.`)
    let txn = database.transaction('test-store', 'readwrite');
    let store = txn.objectStore('test-store');
    for (let i = 0; i < count; i++) {
        await store.put('test data to be inserted', `test${i}`);
    }
    await txn.done;
    console.log("Deleting", count, "key, value entries...");
    txn = database.transaction('test-store', 'readwrite');
    store = txn.objectStore('test-store');
    let deleteBeforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await store.delete('test-store', `test${i}`);
    }
    await txn.done;
    let deleteAfterTime = Date.now();
    let deleteTotalTime = ((deleteAfterTime - deleteBeforeTime) / 1000);
    let deletesPerSecond = (count / deleteTotalTime);
    console.log("- Total time:", deleteTotalTime.toFixed(4), "seconds");
    console.log("- Deletions per second:", deletesPerSecond.toFixed(2));
    console.log();

    const results = {
        "total_time": deleteTotalTime,
        "deletes_per_second": deletesPerSecond
    }
    database.close()
    return results;
}

async function testRandomRead(count) {
    const howMany = 1000
    const database = await idb.openDB('random_read', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    let txn = database.transaction('test-store', 'readwrite');
    let readStore = txn.objectStore('test-store');
    console.log(`Testing IDB reading performance to database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await readStore.put('test data to be inserted', `test${i}`);
    }
    const randomInts = [];
    for (let i = 0; i < howMany; i++) {
        randomInts.push(Math.floor(Math.random() * count));
    }
    console.log("Randomly reading", howMany, "key, value entries...");
    const beforeTime = Date.now();
    for (num of randomInts) {
        if (!(await readStore.get(`test${num}`))) throw new Error('data does not exist');
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000);
    const readsPerSecond = (howMany / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Random reads per second:", readsPerSecond.toFixed(2));
    console.log();

    const results = {
        "total_time": totalTime,
        "reads_per_second": readsPerSecond
    };
    return results;

}

async function testIncreasing(count, num_inc_tests = 5) {
    const database = await idb.openDB('increasing', 1, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            db.createObjectStore('test-store');
        }
    });
    let results = {};
    let currentEntries = 0;
    console.log("Testing IDB writing and reading performance as database size increases.");
    for (let r = 1; r < num_inc_tests + 1; r++) {
        console.log(`Testing Gink TypeScript writing performance to database with ${currentEntries} entries.`);
        console.log("Writing", count, "new key, value entries...");
        let txn = database.transaction('test-store', 'readwrite');
        let writeStore = txn.objectStore('test-store');
        let writeBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await writeStore.put('test data to be inserted', `test${i}`);
        }
        await txn.done;
        let writeAfterTime = Date.now();
        let writeTotalTime = ((writeAfterTime - writeBeforeTime) / 1000);
        let writesPerSecond = (count / writeTotalTime);
        console.log(`** For database starting at ${currentEntries} entries **`);
        console.log("- Total write time:", writeTotalTime.toFixed(4), "seconds");
        console.log("- Writes per second:", writesPerSecond.toFixed(2));
        console.log();

        let read_txn = database.transaction('test-store', 'readwrite');
        let readStore = read_txn.objectStore('test-store');
        console.log(`Testing reading performance from database with ${currentEntries} entries.`);
        readBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            if (!(await readStore.get(`test${i}`))) throw new Error('data does not exist');
        }
        await read_txn.done;
        readAfterTime = Date.now();
        readTotalTime = ((readAfterTime - readBeforeTime) / 1000);
        readsPerSecond = (count / readTotalTime);
        console.log(`** For database with ${count * r} entries **`);
        console.log("- Total read time:", readTotalTime.toFixed(4), "seconds");
        console.log("- Reads per second:", readsPerSecond.toFixed(2));
        console.log();

        results[count * r] = {
            "write": {
                "total_time": writeTotalTime,
                "writes_per_second": writesPerSecond
            },
            "read": {
                "total_time": readTotalTime,
                "reads_per_second": readsPerSecond
            }
        }

        currentEntries = count * r;
    }
    database.close()
    return results;
}

async function testAll(count, num_inc_tests) {
    const results = {}
    results["write_fresh"] = await testWriteFresh(count);
    results["write_big_commit"] = {
        "total_time": 0,
        "writes_per_second": 0
    } // this is a placeholder until I can figure out the best way
    // to run this test for idb.
    results["write_occupied"] = await testWriteOccupied(count);
    results["read"] = await testRead(count);
    results["read_write"] = await testReadWrite(count);
    results["delete"] = await testDelete(count);
    results["random_read"] = await testRandomRead(count);
    results["increasing"] = await testIncreasing(count, num_inc_tests);
    return results;
}