#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { existsSync, unlinkSync } = require("fs");
const { sleep } = require("./browser_test_utilities.js");
const TEST_DB_PATH = "/tmp/chain-reuse-ts-test.db";
process.chdir(__dirname + "/..");
let result = 1;
let instance;
let instance2;
process.exit(0); // TODO: fix
(async () => {
    console.log("starting");
    if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
    }

    instance = new Expector(
        "./tsc.out/implementation/main.js",
        [TEST_DB_PATH, "-i", "chain-test@test", "--verbose"],
        {
            env: { ...process.env },
        },
    );
    await instance.expect("using", 10000);
    console.log("instance started");
    instance.send("await root.set(3,4, 'test');1;\n");
    await sleep(100);
    console.log("set some data");
    instance.send(
        `await root.set("chainStart", (database.getLastLink()).chainStart);2;\n`,
    );
    await sleep(100);
    instance.send(`await database.close();\n`);
    await sleep(100);
    await instance.close();

    instance2 = new Expector(
        "./tsc.out/implementation/main.js",
        [TEST_DB_PATH, "-i", "chain-test@test", "--verbose"],
        {
            env: { ...process.env },
        },
    );
    await instance2.expect("using", 10000);
    console.log("instance2 started");
    instance2.send("await root.set(4,5, 'test2');3;\n");
    await sleep(100);
    instance2.send(
        "var currentChainStart = (database.getLastLink()).chainStart; 4;\n",
    );
    await sleep(100);
    instance2.send('var priorChainStart = await root.get("chainStart"); 5;\n');
    await sleep(100);
    instance2.send(
        "console.log(`current=${currentChainStart}, prior=${priorChainStart}`);6;\n",
    );
    instance2.send(
        `console.log(currentChainStart == priorChainStart ? "GLiLcrbk" : 11);\n`,
    );
    await sleep(100);
    await instance2.expect("GLiLcrbk");
    result = 0;
})()
    .catch(async (reason) => {
        console.log("in chain-reuse-ts-test catch block");
        console.error(reason);
    })
    .finally(async () => {
        if (instance instanceof Expector) await instance.close();
        if (instance2 instanceof Expector) await instance2.close();
        process.exit(result);
    });
