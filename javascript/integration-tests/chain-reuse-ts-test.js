#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { Database } = require("../tsc.out/implementation/Database.js");
const { LogBackedStore } = require("../tsc.out/implementation/LogBackedStore.js");
const { existsSync, unlinkSync } = require('fs');
const { sleep } = require('./browser_test_utilities.js');
const TEST_DB_PATH = "/tmp/chain-reuse-ts-test.db";

(async () => {
    console.log("starting");
    if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
    }

    const instance = new Expector("./tsc.out/implementation/main.js", [], {
        env: {
            GINK_DATA_FILE: TEST_DB_PATH,
            GINK_IDENTITY: "chain-test@test",
            ...process.env
        }
    });
    await instance.expect("using", 10000);
    console.log("instance started");
    instance.send("await root.set(3,4, 'test');\n");
    await sleep(100);
    instance.send(`await root.set("chainStart", JSON.stringify(database.myChain));\n`);
    await sleep(100);
    await instance.close();

    const instance2 = new Expector("./tsc.out/implementation/main.js", [], {
        env: {
            GINK_DATA_FILE: TEST_DB_PATH,
            GINK_IDENTITY: "chain-test@test",
            ...process.env
        }
    });
    await instance2.expect("using", 10000);
    console.log("instance started");
    instance2.send("await root.set(4,5, 'test2');\n");
    await sleep(100);
    instance2.send(`console.log(database.myChain.chainStart, JSON.parse((await root.get("chainStart"))).chainStart);\n`);
    await sleep(100);
    instance2.send(`ensure(database.myChain.chainStart == JSON.parse((await root.get("chainStart"))).chainStart);\n`);
    await sleep(100);
    await instance2.close();



    process.exit(0);
})().catch(async (reason) => {
    console.error(reason);
    await server.close();
    process.exit(1);
});
