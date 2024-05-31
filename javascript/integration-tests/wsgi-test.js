#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
const { spawnSync } = require("child_process");
process.chdir(__dirname + "/..");
(async () => {
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--wsgi", "examples.wsgi.hello", "--wsgi_listen_on", "*:8091"]
    );
    await server.expect("listening", 2000);
    await sleep(500);

    const result1 = spawnSync("curl", ["http://localhost:8091", "-s"]);
    if (!(result1.stdout.toString().trim() == "Hello, World!")) {
        console.error("FAILED");
        process.exit(1);
    }

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
