#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep, getSafePort } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    const port = getSafePort();
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--wsgi", "examples.wsgi.hello", `--wsgi_listen_on", "*:${port}`]
    );
    await server.expect("listening", 2000);
    await sleep(500);

    const result = (await (await fetch(`http://0.0.0.0:${port}`)).text()).trim();
    if (!(result == "Hello, World!")) {
        console.error("FAILED");
        process.exit(1);
    }

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
