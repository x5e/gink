#!/usr/bin/env node
let gink = require("../tsc.out/implementation/index");

if (typeof window === "undefined") {
    let gink = require("../tsc.out/implementation/index");
}

async function testWriteFresh(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "write_fresh",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    console.log(
        "Testing Gink TypeScript writing performance to fresh database."
    );
    console.log("Writing", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const writesPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        writes_per_second: writesPerSecond,
    };
    return results;
}

async function testWriteBigBundle(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "write_big_bundle",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    const bundler = new gink.Bundler();
    console.log(
        "Testing Gink TypeScript writing performance to fresh database in one bundle."
    );
    console.log("Writing", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted", bundler);
    }
    await bundler.commit();
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const writesPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        writes_per_second: writesPerSecond,
    };
    return results;
}

async function testWriteOccupied(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "write_occupied",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    console.log(
        `Testing Gink TypeScript writing performance to occupied database with ${count} entries.`
    );
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
    const totalTime = (afterTime - beforeTime) / 1000;
    const writesPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Writes per second:", writesPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        writes_per_second: writesPerSecond,
    };
    return results;
}

async function testRead(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore("read", true, (keepingHistory = keepHistory))
    );
    const directory = await Directory.create(instance);
    console.log(
        `Testing Gink TypeScript reading performance to database with ${count} entries.`
    );
    console.log(`Filling fresh database with ${count} key, value entries...`);
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
    }
    console.log("Reading", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        if (!(await directory.get(`test${i}`)))
            throw new Error(`test${i} doesn't exist.`);
    }
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const readsPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Reads per second:", readsPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        reads_per_second: readsPerSecond,
    };
    return results;
}

async function testSequenceAppend(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "sequence_append",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const sequence = await instance.createSequence();
    console.log(
        "Testing Gink TypeScript Sequence append (push) performance to fresh database."
    );
    console.log("Appending", count, "entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await sequence.push(`test${i}`);
    }
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const appendsPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Appends per second:", appendsPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        appends_per_second: appendsPerSecond,
    };
    return results;
}

async function testReadWrite(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "read_write",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    console.log("Testing Gink TypeScript writing then reading performance.");
    console.log("Writing then reading", count, "key, value entries...");
    const beforeTime = Date.now();
    for (let i = 0; i < count; i++) {
        await directory.set(`test${i}`, "test data to be inserted");
        if (!(await directory.get(`test${i}`)))
            throw new Error(`test${i} doesn't exist.`);
    }
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const txnsPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Transactions per second:", txnsPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        txns_per_second: txnsPerSecond,
    };
    return results;
}

async function testDelete(count, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore("delete", true, (keepingHistory = keepHistory))
    );
    const directory = await Directory.create(instance);
    console.log(
        `Testing Gink TypeScript deletion performance to occupied database with ${count} entries.`
    );
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
    if (await directory.get(`test${count / 2}`))
        throw new Error(`test${count / 2} still exists.`); // Make sure stuff was actually deleted
    const totalTime = (afterTime - beforeTime) / 1000;
    const deletesPerSecond = count / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Deletions per second:", deletesPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        deletes_per_second: deletesPerSecond,
    };
    return results;
}

async function testRandomRead(count, keepHistory) {
    const howMany = 1000;
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "random_read",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    console.log(
        `Testing Gink TypeScript reading performance to database with ${count} entries.`
    );
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
        if (!(await directory.get(`test${num}`)))
            throw new Error(`test${num} doesn't exist.`);
    }
    const afterTime = Date.now();
    const totalTime = (afterTime - beforeTime) / 1000;
    const readsPerSecond = howMany / totalTime;
    console.log("- Total time:", totalTime.toFixed(4), "seconds");
    console.log("- Random reads per second:", readsPerSecond.toFixed(2));
    console.log();

    const results = {
        total_time: totalTime,
        reads_per_second: readsPerSecond,
    };
    return results;
}

async function testIncreasing(count, num_inc_tests, keepHistory) {
    const instance = new gink.Database(
        new gink.IndexedDbStore(
            "increasing",
            true,
            (keepingHistory = keepHistory)
        )
    );
    const directory = await Directory.create(instance);
    let currentEntries = 0;
    let results = {};
    console.log(
        "Testing Gink TypeScript writing and reading performance as database size increases."
    );

    for (let r = 1; r < num_inc_tests + 1; r++) {
        console.log(
            `Testing Gink TypeScript writing performance to database with ${currentEntries} entries.`
        );
        console.log("Writing", count, "new key, value entries...");
        const writeBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            await directory.set(`test${i}`, "test data to be inserted");
        }
        const writeAfterTime = Date.now();
        const writeTotalTime = (writeAfterTime - writeBeforeTime) / 1000;
        const writesPerSecond = count / writeTotalTime;
        console.log(`** For database starting at ${currentEntries} entries **`);
        console.log(
            "- Total write time:",
            writeTotalTime.toFixed(4),
            "seconds"
        );
        console.log("- Writes per second:", writesPerSecond.toFixed(2));
        console.log();

        const readBeforeTime = Date.now();
        for (let i = 0; i < count; i++) {
            if (!(await directory.get(`test${i}`)))
                throw new Error(`test${i} doesn't exist.`);
        }
        const readAfterTime = Date.now();
        const readTotalTime = (readAfterTime - readBeforeTime) / 1000;
        const readsPerSecond = count / readTotalTime;
        console.log(`** For database with ${count * r} entries **`);
        console.log("- Total read time:", readTotalTime.toFixed(4), "seconds");
        console.log("- Reads per second:", readsPerSecond.toFixed(2));
        console.log();

        results[count * r] = {
            write: {
                total_time: writeTotalTime,
                writes_per_second: writesPerSecond,
            },
            read: {
                total_time: readTotalTime,
                reads_per_second: readsPerSecond,
            },
        };

        currentEntries = count * r;
    }

    return results;
}

async function testAll(count, num_inc_tests, keepHistory) {
    const results = {};
    results["write_fresh"] = await testWriteFresh(count);
    results["write_big_bundle"] = await testWriteBigBundle(count);
    results["write_occupied"] = await testWriteOccupied(count);
    results["read"] = await testRead(count);
    results["sequence_append"] = await testSequenceAppend(count);
    results["read_write"] = await testReadWrite(count);
    results["delete"] = await testDelete(count, keepHistory);
    results["random_read"] = await testRandomRead(count);
    results["increasing"] = await testIncreasing(count, num_inc_tests);
    return results;
}

async function main(tests, count, increasing, keepHistory) {
    if (tests === "all") {
        results = await testAll(count, increasing, keepHistory);
    } else {
        results = {};
        if (tests.includes("write_fresh")) {
            results["write_fresh"] = await testWriteFresh(count, keepHistory);
        }
        if (tests.includes("write_big_bundle")) {
            results["write_big_bundle"] = await testWriteBigBundle(
                count,
                keepHistory
            );
        }
        if (tests.includes("write_occupied")) {
            results["write_occupied"] = await testWriteOccupied(
                count,
                keepHistory
            );
        }
        if (tests.includes("sequence_append")) {
            results["sequence_append"] = await testSequenceAppend(
                count,
                keepHistory
            );
        }
        if (tests.includes("read")) {
            results["read"] = await testRead(count, keepHistory);
        }
        if (tests.includes("read_write")) {
            results["read_write"] = await testReadWrite(count, keepHistory);
        }
        if (tests.includes("delete")) {
            results["delete"] = await testDelete(count, keepHistory);
        }
        if (tests.includes("random_read")) {
            results["random_read"] = await testRandomRead(count, keepHistory);
        }
        if (tests.includes("increasing")) {
            results["increasing"] = await testIncreasing(
                count,
                increasing,
                keepHistory
            );
        }
    }
    return results;
}

if (require.main === module) {
    const { ArgumentParser } = require("argparse");
    const fs = require("fs");

    const parser = new ArgumentParser();
    parser.add_argument("-c", "--count", {
        help: "number of records",
        type: "int",
        default: 100,
    });
    parser.add_argument("-o", "--output", {
        help: "json file to save output. default to no file, stdout",
    });
    parser.add_argument("-k", "--keepHistory", {
        help: "keep history?",
        default: false,
        type: Boolean,
    });

    const helpIncreasing = `
        Number of intervals to run the increasing test.
        Max entries will be -> this flag * count.
        `;
    parser.add_argument("-i", "--increasing", {
        help: helpIncreasing,
        type: "int",
        default: 5,
    });

    const helpTests = `
        Each test has an isolated instance of a store,
        so each test may be run independently.

        Specific tests to run:

        write_fresh
        write_big_bundle
        write_occupied
        sequence_append
        read
        read_write
        delete
        random_read
        increasing
        `;
    const choicesTests = [
        "write_fresh",
        "write_big_bundle",
        "write_occupied",
        "sequence_append",
        "read",
        "read_write",
        "delete",
        "random_read",
        "increasing",
    ];
    parser.add_argument("-t", "--tests", {
        help: helpTests,
        nargs: "+",
        choices: choicesTests,
        default: "all",
    });
    const args = parser.parse_args();
    (async () => {
        const results = await main(
            args.tests,
            args.count,
            args.increasing,
            args.keepHistory
        );
        if (args.output) {
            try {
                const fileData = fs.readFileSync(args.output);
                data = JSON.parse(fileData);
                data["gink_node"] = results;
            } catch {
                data = { gink_node: results };
            }
            fs.writeFileSync(args.output, JSON.stringify(data));
        }
    })();
}
