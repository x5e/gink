#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
const fs = require("fs");

process.chdir(__dirname + "/..");

const DUMP_PATH = "/tmp/py-load-test.dump";
const TEST_DB_PATH1 = "/tmp/py-load-test1.db";
const TEST_DB_PATH2 = "/tmp/py-load-test2.db";
(async () => {
    if (fs.existsSync(DUMP_PATH)) fs.unlinkSync(DUMP_PATH);
    if (fs.existsSync(TEST_DB_PATH1)) fs.unlinkSync(TEST_DB_PATH1);
    if (fs.existsSync(TEST_DB_PATH2)) fs.unlinkSync(TEST_DB_PATH2);

    console.log("starting");
    const db1 = new Expector(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH1, "--format", "lmdb"],
        {
            env: {
                ...process.env
            }
        }
    );
    db1.send("root.set('foo', 'bar');\n");
    await db1.expect("Muid", 2000);
    db1.send("Sequence(contents=[1, 2, 3, 4, 5]);\n");
    await db1.expect("Sequence", 2000);
    db1.send("KeySet(contents=[1, 2, 3, 4, 5]);\n");
    await db1.expect("KeySet", 2000);
    await db1.close();

    const dumped = new Expector(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH1, "--format", "lmdb", "--dump_to", DUMP_PATH],
        {
            env: {
                ...process.env
            }
        }
    );
    await dumped.expect(/\bDumped\b/, 2000);
    await dumped.close();

    const loaded = new Expector(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH2, "--format", "lmdb", "--load", DUMP_PATH],
        {
            env: {
                ...process.env
            }
        }
    );
    await loaded.expect(/\bLoaded\b/, 2000);
    await loaded.close();
    const gink = new Expector(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH2, "--format", "lmdb"],
        {
            env: {
                ...process.env
            }
        }
    );
    await sleep(1000);
    gink.send("root.get('foo');\n");
    await gink.expect(/.*'bar'.*/, 2000);

    await gink.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
