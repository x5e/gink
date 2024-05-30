#!/usr/bin/env -S node --unhandled-rejections=strict
// const Expector = require("./Expector.js");
// const { sleep } = require("./browser_test_utilities.js");
const fs = require("fs");
const { spawnSync } = require("child_process");
const TEST_DB_PATH = "/tmp/client-reuse-test.db";
process.chdir(__dirname + "/..");
(async () => {
    console.log("starting");
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    const format = process.argv.length >= 3 ? process.argv[2] : "lmdb";
    console.log(`using format=${format}`);

    const result1 = spawnSync(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH, "--format", format,
            "--identity", "abc", "--set", "foo", "<<<", "bar"],
        { shell: "/usr/bin/bash" }
    );

    if (result1.status != 0) {
        // throw Error(`invocation 1 failed ${result1.stderr}`);
        console.log(result1.status);
    }

    const result2 = spawnSync(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH, "--format", format,
            "--identity", "abc", "--set", "bar", "<<<", "baz"],
        { shell: "/usr/bin/bash" }
    );

    if (result2.status != 0) {
        // throw Error(`invocation 2 failed ${result2.stderr}`);
        console.log(result2.status);
    }

    const result3 = spawnSync(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH, "--format", format,
            "--identity", "xyz", "--set", "xxx", "<<<", "zzz"],
        { shell: "/usr/bin/bash" }
    );

    if (result3.status != 0) {
        // throw Error(`invocation 3 failed ${result3.stderr}`);
        console.log(result3.status);
    }

    const result4 = spawnSync(
        "/usr/bin/bash", ["-c",
        `"python3 -m gink ${TEST_DB_PATH} --log --format ${format} | cut -b 1-13 | sort -u | wc -l "`],
        { shell: "/usr/bin/bash" }
    );


    if (result4.status != 0) {
        // throw Error(`invocation 3 failed ${result4.stderr}`);
        console.log(result4.status);
    }

    const found = result4.stdout.toString();
    if (found.match(/^2\s*$/)) {
        console.log("success!");
        process.exit(0);
    }
    console.error(`found=>${found}<=`);
    process.exit(1);

})().catch((reason) => { console.error(reason); process.exit(1); });
