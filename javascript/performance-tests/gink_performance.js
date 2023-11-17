#!/usr/bin/env node

const gink = require('../tsc.out/implementation/index');
const utils = require('../tsc.out/implementation/utils');
const fs = require('fs');
const { ArgumentParser } = require('argparse');

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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const writesPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const writesPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const writesPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const readsPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Reads per second:", readsPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const appendsPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Appends per second:", appendsPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const txnsPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Transactions per second:", txnsPerSecond.toFixed(2));
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
    const totalTime = ((afterTime - beforeTime) / 1000);
    const deletesPerSecond = (count / totalTime);
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Deletions per second:", deletesPerSecond.toFixed(2));
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

async function test_increasing(count, num_inc_tests) {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore('increasing', true, keepingHistory = false));
    const directory = await instance.createDirectory();
    let currentEntries = 0;
    let results = {}
    console.log("Testing Gink TypeScript writing and reading performance as database size increases.");

    for (let r = 1; r < num_inc_tests + 1; r++) {
        console.log(`Testing Gink TypeScript writing performance to database with ${currentEntries} entries.`);
        console.log("Writing", count, "new key, value entries...");
        const writeBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await directory.set(`test${i}`, "test data to be inserted");
        }
        const writeAfterTime = Date.now();
        const writeTotalTime = ((writeAfterTime - writeBeforeTime) / 1000);
        const writesPerSecond = (count / writeTotalTime);
        console.log(`** For database starting at ${currentEntries} entries **`);
        console.log("- Total write time:", writeTotalTime.toFixed(4), "seconds");
        console.log("- Writes per second:", writesPerSecond.toFixed(2));
        console.log();

        const readBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await directory.set(`test${i}`, "test data to be inserted");
        }
        const readAfterTime = Date.now();
        const readTotalTime = ((readAfterTime - readBeforeTime) / 1000);
        const readsPerSecond = (count / readTotalTime);
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

    return results;
}

async function test_all(count, num_inc_tests) {
    const results = {}
    results["write_fresh"] = await test_write_fresh(count);
    results["write_big_commit"] = await test_write_big_commit(count);
    results["write_occupied"] = await test_write_occupied(count);
    results["read"] = await test_read(count);
    results["sequence_append"] = await test_sequence_append(count);
    results["read_write"] = await test_read_write(count);
    results["delete"] = await test_delete(count);
    results["random_read"] = await test_random_read(count);
    results["increasing"] = await test_increasing(count, num_inc_tests);
    return results;
}

if (require.main === module) {
    const parser = new ArgumentParser();
    parser.add_argument("-c", "--count", { help: "number of records", type: 'int', default: 100 })
    parser.add_argument("-o", "--output", { help: "json file to save output. default to no file, stdout" })
    const help_increasing = `
        Number of intervals to run the increasing test.
        Max entries will be -> this flag * count.
        `
    parser.add_argument("-i", "--increasing", { help: help_increasing, type: 'int', default: 5 })

    const help_tests = `
        Each test has an isolated instance of a store,
        so each test may be run independently.

        Specific tests to run:

        write_fresh
        write_big_commit
        write_occupied
        sequence_append
        read
        read_write
        delete
        random_read
        increasing
        `
    const choices_tests = ["write_fresh", "write_big_commit", "write_occupied", "sequence_append", "read", "read_write", "delete", "random_read", "increasing"]
    parser.add_argument("-t", "--tests", { help: help_tests, nargs: "+", choices: choices_tests, default: "all" })
    const args = parser.parse_args();
    (async () => {
        if (args.tests == "all") {
            results = await test_all(args.count, args.increasing)
        }
        else {
            results = {}
            if (args.tests.includes("write_fresh")) {
                results["write_fresh"] = await test_write_fresh(args.count)
            }
            if (args.tests.includes("write_big_commit")) {
                results["write_big_commit"] = await test_write_big_commit(args.count)
            }
            if (args.tests.includes("write_occupied")) {
                results["write_occupied"] = await test_write_occupied(args.count)
            }
            if (args.tests.includes("sequence_append")) {
                results["sequence_append"] = await test_sequence_append(args.count)
            }
            if (args.tests.includes("read")) {
                results["read"] = await test_read(args.count)
            }
            if (args.tests.includes("read_write")) {
                results["read_write"] = await test_read_write(args.count)
            }
            if (args.tests.includes("delete")) {
                results["delete"] = await test_delete(args.count)
            }
            if (args.tests.includes("random_read")) {
                results["random_read"] = await test_random_read(args.count)
            }
            if (args.tests.includes("increasing")) {
                results["increasing"] = await test_increasing(args.count, args.increasing)
            }
        }

        if (args.output) {
            try {
                const file_data = fs.readFileSync(args.output)
                data = JSON.parse(file_data);
                data["gink_typescript"] = results;
            }
            catch {
                data = { "gink_typescript": results };
            }
            fs.writeFileSync(args.output, JSON.stringify(data));
        }
    })();
}
