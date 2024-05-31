#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--wsgi", "examples.wsgi.hello"]
    );
    await server.expect("listening", 2000);
    await sleep(500);

    const client = new Expector(
        "curl",
        ["http://0.0.0.0:8081", "-s"]
    );
    await client.expect(/hello/i, 2000);

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
