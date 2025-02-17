#!/usr/bin/env -S node --unhandled-rejections=strict
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

// Mac's bash is located in /bin/bash
const shell = os.platform() === "linux" ? "/usr/bin/bash" : "/bin/bash";
const TEST_DB_PATH = "/tmp/chain-reuse-py-test.db";
process.chdir(__dirname + "/..");

for (const format of ["lmdb"]) {
    console.log("starting");
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    console.log(`using format=${format}`);

    const result1 = spawnSync(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            TEST_DB_PATH,
            "--file_format",
            format,
            "--identity",
            "abc",
            "--set",
            "foo",
            "<<<",
            "bar",
        ],
        { shell: shell },
    );

    if (result1.status !== 0) {
        throw Error(`invocation 1 failed ${result1.stderr}`);
    } else {
        console.log(`invocation 1 okay, stderr=\n${result1.stderr}`);
    }

    const result2 = spawnSync(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            TEST_DB_PATH,
            "--file_format",
            format,
            "--identity",
            "abc",
            "--set",
            "bar",
            "<<<",
            "baz",
        ],
        { shell: shell },
    );

    if (result2.status !== 0) {
        throw Error(`invocation 2 failed ${result2.stderr}`);
    } else {
        console.log(`invocation 2 okay, stderr=\n${result2.stderr}`);
    }

    const result3 = spawnSync(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            TEST_DB_PATH,
            "--file_format",
            format,
            "--identity",
            "xyz",
            "--set",
            "xxx",
            "<<<",
            "zzz",
        ],
        { shell: shell },
    );

    if (result3.status !== 0) {
        throw Error(`invocation 3 failed ${result3.stderr}`);
    } else {
        console.log(`invocation 3 okay, , stderr=\n${result3.stderr}`);
    }

    const result4 = spawnSync(
        shell,
        [
            "-c",
            `"python3 -m gink ${TEST_DB_PATH} --log --log_format %Q | sort -u | wc -l "`,
        ],
        { shell: shell },
    );

    if (result4.status !== 0) {
        throw Error(`invocation 4 failed ${result4.stderr}`);
    } else {
        console.log(`invocation 4 okay , stderr=\n${result4.stderr}`);
    }

    const found = result4.stdout.toString().trim();
    if (found === "2") {
        console.log("success!");
    } else {
        console.error(`failure. found =>${found}<= chains.`);
        process.exit(1);
    }
}
