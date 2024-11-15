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
        ["-u", "-m", "gink", TEST_DB_PATH1, "--format", "lmdb", "-v", "DEBUG"],
        {
            env: {
                ...process.env,
            },
        }
    );
    db1.send("root.set('foo', 'bar');\n");
    await db1.expect("Muid", 2000);
    db1.send("seq = Sequence(contents=[1, 2, 3, 4, 5]);\n");
    await db1.expect("locally", 2000);
    db1.send("ks = KeySet(contents=[1, 2, 3, 4, 5]);\n");
    await db1.expect("locally", 2000);
    db1.send("box = Box(contents='box contents', database=database);\n");
    await db1.expect("locally", 2000);
    db1.send(
        "ps = PairSet(contents={'include': [(box, ks)], 'exclude': [(seq, ks)]}, database=database);\n"
    );
    await db1.expect("locally", 2000);
    db1.send(
        "pm = PairMap(contents={(box, ks): 'value', (box, ps): 3}, database=database);\n"
    );
    await db1.expect("locally", 2000);
    db1.send("prop = Property(contents={root: 'value'}, database=database);\n");
    await db1.expect("locally", 2000);
    db1.send(
        "Group(contents={'include': {box, ps}, 'exclude': {pm}}, database=database);\n"
    );
    await db1.expect("Group", 2000);
    await db1.close();

    const dumped = new Expector(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            TEST_DB_PATH1,
            "--format",
            "lmdb",
            "--dump_to",
            DUMP_PATH,
        ],
        {
            env: {
                ...process.env,
            },
        }
    );
    await dumped.expect(/\bDumped\b/, 2000);
    await dumped.close();

    const loaded = new Expector(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            TEST_DB_PATH2,
            "--format",
            "lmdb",
            "--load",
            DUMP_PATH,
        ],
        {
            env: {
                ...process.env,
            },
        }
    );
    await loaded.expect(/\bLoaded\b/, 2000);
    await loaded.close();
    const gink = new Expector(
        "python3",
        ["-u", "-m", "gink", TEST_DB_PATH2, "--format", "lmdb"],
        {
            env: {
                ...process.env,
            },
        }
    );
    await sleep(1000);

    const regex = new RegExp(
        `Sequence\\(muid=Muid\\((.*)\\), contents=\\[[\\s\\S]*?` +
            `KeySet\\(muid=Muid\\((.*)\\), contents=\\{5,4,3,2,1\\}\\)[\\s\\S]*?` +
            `Box\\(muid=Muid\\((.*)\\), contents='box contents'\\)[\\s\\S]*?` +
            `PairSet\\(muid=Muid\\((.*)\\), contents=\\{[\\s\\S]*?` +
            `PairMap\\(muid=Muid\\((.*)\\), contents=\\{[\\s\\S]*?` +
            `Property\\(muid=Muid\\((.*)\\), contents=\\{[\\s\\S]*?` +
            `Group\\(muid=Muid\\((.*)\\), contents=\\{[\\s\\S]*?` +
            `Directory\\(arche=True, contents=\\{'foo': 'bar'\\}\\)`
    );
    gink.send("database.dump();\n");
    await gink.expect(regex, 2000);

    await gink.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(0);
});
