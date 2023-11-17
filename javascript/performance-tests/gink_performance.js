let gink = require('../tsc.out/implementation/index');
let utils = require('../tsc.out/implementation/utils')

async function test_write_fresh(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('write_fresh', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log("Testing Gink TypeScript writing performance to fresh database.");
    console.log("Writing", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const writesPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Writes per second:", writesPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "writes_per_second": writesPerSecond
    };
    return results;
}

async function test_write_big_commit(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('write_big_commit', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    const bundler = new gink.Bundler();
    console.log("Testing Gink TypeScript writing performance to fresh database in one commit.");
    console.log("Writing", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted", bundler);
    }
    await instance.addBundler(bundler);
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const writesPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Writes per second:", writesPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "writes_per_second": writesPerSecond
    };
    return results;
}

async function test_write_occupied(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('write_occupied', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log(`Testing Gink TypeScript writing performance to occupied database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    console.log("Writing", count, "new key, value entries...");
    const beforeTime = Date.now();
    for (let i = count; i < count * 2; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const writesPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Writes per second:", writesPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "writes_per_second": writesPerSecond
    };
    return results;
}

async function test_read(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('read', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log(`Testing Gink TypeScript reading performance to database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    console.log("Reading", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        utils.ensure(await directory.get(`test${i}`));
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const readsPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Reads per second:", readsPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "reads_per_second": readsPerSecond
    };
    return results;
}

async function test_sequence_append(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('sequence_append', true, keepingHistory = false));
    const sequence = await instance.createSequence();
    console.log("Testing Gink TypeScript Sequence append (push) performance to fresh database.");
    console.log("Appending", count, "entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await sequence.push(`test${i}`);
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const appendsPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Appends per second:", appendsPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "appends_per_second": appendsPerSecond
    };
    return results;

}

async function test_read_write(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('read_write', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log("Testing Gink TypeScript writing then reading performance.");
    console.log("Writing then reading", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
        utils.ensure(await directory.get(`test${i}`));
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const txnsPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Transactions per second:", txnsPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "txns_per_second": txnsPerSecond
    };
    return results;
}

async function test_delete(count) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('delete', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log(`Testing Gink TypeScript deletion performance to occupied database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    console.log("Deleting", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.delete(`test${i}`);
    }
    const afterTime = Date.now();
    utils.ensure(!await directory.get(`test${count / 2}`)); // Make sure stuff was actually deleted
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const deletesPerSecond = (count / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Deletions per second:", deletesPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "deletes_per_second": deletesPerSecond
    };
    return results;
}

async function test_random_read(count) {
    const howMany = 1000
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('random_read', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    console.log(`Testing Gink TypeScript reading performance to database with ${count} entries.`);
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    const randomInts = [];
    for (let i = 0; i < howMany; i++) {
        randomInts.push(Math.floor(Math.random() * count));
    }
    console.log("Randomly reading", howMany, "key, value entries...");
    const beforeTime = Date.now();
    for (num of randomInts) {
        utils.ensure(await directory.get(`test${num}`));
    }
    const afterTime = Date.now();
    const totalTime = ((afterTime - beforeTime) / 1000).toFixed(4);
    const readsPerSecond = (howMany / totalTime).toFixed(2);
    console.log("- Total time:", totalTime, "seconds");
    console.log("- Random reads per second:", readsPerSecond);
    console.log();

    const results = {
        "total_time": totalTime,
        "reads_per_second": readsPerSecond
    };
    return results;

}

async function test_increasing(count, num_inc_tests) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('increasing', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    let currentEntries = 0;
    let results = {}
    console.log("Testing Gink TypeScript writing and reading performance as database size increases.");

    for (let r = 1; r < num_inc_tests + 1; r++) {
        console.log(`Testing Gink TypeScript writing performance to database with ${currentEntries} entries.`);
        console.log("Writing", count, "key, value entries...");
        const writeBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await directory.set(`test${i}`, "test data to be inserted");
        }
        const writeAfterTime = Date.now();
        const writeTotalTime = ((writeAfterTime - writeBeforeTime) / 1000).toFixed(4);
        const writesPerSecond = (count / writeTotalTime).toFixed(2);
        console.log(`** For database starting at ${currentEntries} entries **`);
        console.log("- Total write time:", writeTotalTime, "seconds");
        console.log("- Writes per second:", writesPerSecond);
        console.log();

        const readBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await directory.set(`test${i}`, "test data to be inserted");
        }
        const readAfterTime = Date.now();
        const readTotalTime = ((readAfterTime - readBeforeTime) / 1000).toFixed(4);
        const readsPerSecond = (count / readTotalTime).toFixed(2);
        console.log(`** For database with ${count * r} entries **`);
        console.log("- Total read time:", readTotalTime, "seconds");
        console.log("- Reads per second:", readsPerSecond);
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

    return results;
}

async function test_all(count) {
    const results = {}
    results["write_fresh"] = await test_write_fresh(count);
    results["write_big_commit"] = await test_write_big_commit(count);
    results["write_occupied"] = await test_write_occupied(count);
    results["read"] = await test_read(count);
    results["sequence_append"] = await test_sequence_append(count);
    results["read_write"] = await test_read_write(count);
    results["delete"] = await test_delete(count);
    results["random_read"] = await test_random_read(count);
    results["increases"] = await test_increasing(count);
    return results;
}

(async () => {
    await test_all(1000);
})();
