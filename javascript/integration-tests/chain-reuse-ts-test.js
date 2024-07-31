#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { existsSync, unlinkSync } = require('fs');
const { sleep } = require('./browser_test_utilities.js');
const TEST_DB_PATH = "/tmp/chain-reuse-ts-test.db";
process.chdir(__dirname + "/..");
let result = 1;
let instance;
let instance2;
(async () => {
    console.log("starting");
    if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
    }

    instance = new Expector("./tsc.out/implementation/main.js",
        ["--data-file", TEST_DB_PATH, "-i", "chain-test@test", "-v", "true"], {
        env: { ...process.env },
    });
    await instance.expect("using", 10000);
    console.log("instance started");
    instance.send("await root.set(3,4, 'test');\n");
    await sleep(100);
    console.log("set some data");
    instance.send(`await root.set("chainStart", await database.getChain().chainStart);\n`);
    await sleep(100);
    await instance.close();

    instance2 = new Expector("./tsc.out/implementation/main.js",
        ["--data-file", TEST_DB_PATH, "-i", "chain-test@test", "-v", "true"], {
        env: { ...process.env }
    });
    await instance2.expect("using", 10000);
    console.log("instance started");
    instance2.send("await root.set(4,5, 'test2');\n");
    await sleep(100);
    // instance2.send(`console.log(await database.getChain().chainStart, await root.get("chainStart"));\n`);
    await sleep(100);
    instance2.send('var match = ((await database.getChain().chainStart) == await root.get("chainStart"))');
    instance2.send(`console.log(match ? "GLiLcrbk" : 11)`);
    await sleep(100);
    await instance2.expect("GLiLcrbk");
    result = 0;
})().catch(async (reason) => {
    console.error(reason);
}).finally(async () => {
    if (instance instanceof Expector)
        await instance.close();
    if (instance2 instanceof Expector)
        await instance2.close();
    process.exit(result);
})
