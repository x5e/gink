#!/usr/bin/env -S node --unhandled-rejections=strict --trace-uncaught --trace-warnings
const Expector = require("./Expector.js");
const { existsSync, unlinkSync } = require('fs');
const { sleep } = require("./browser_test_utilities.js");

process.chdir(__dirname + "/../../python");

const TEST_DB_PATH = "/tmp/accumulator-reuse-test.gink"
if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
}
/*
const xxx = new Expector("cat");
xxx.send("dog\n");
await xxx.expect("dog");
console.log("here");
await xxx.close();
process.exit(0);
*/

(async () => {
    try {
        console.log("started");
        const args = ["-uim", "gink", TEST_DB_PATH]
        const python1 = new Expector("python3", args);
        python1.send("1+2\n")
        await python1.expect("3");
        console.log("got three")
        await sleep(100);
        //python1.send("from gink import * \n")
        await sleep(100);
        //python1.send("db = Database('/tmp/foo.gink')\n");
        await sleep(100);
        python1.send("accum = root['accum'] = Accumulator()\n");
        await sleep(100);
        python1.send("accum += 3.7\n");
        await sleep(100);
        python1.send("accum.get()\n");
        await sleep(1000);
        console.log(`captured = ${JSON.stringify(python1.captured)}`);
        await python1.expect("3.7", 2000);
        await python1.close();
        console.log("finished first process");

        const cobra = new Expector("python3", args);
        cobra.send("2+3\n")
        await cobra.expect("5");
        console.log("got 5");
        cobra.send("accum = root['accum']\n");
        await sleep(100);
        cobra.send("accum.get()\n");
        await cobra.expect("3.7");
        cobra.send("accum += 7.4\n");
        await sleep(100);
        cobra.send("accum.get()\n");
        await cobra.expect("11.1");
        process.exit(0);
    } catch (error) {
        console.log(`error = ${error}`);
        process.exit(13);
    }
})();
console.log("after");
