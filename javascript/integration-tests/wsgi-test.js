#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
process.chdir(__dirname + "/..");
(async () => {
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--wsgi", "examples.wsgi.hello"]
    );
    await server.expect("listening");

    const client = new Expector(
        "curl",
        ["http://localhost:8081", "-s"]
    );
    await client.expect(/hello/i);

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
