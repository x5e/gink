#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");

(async () => {
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: "8087", ...process.env } });
    await server.expect("ready");

    const client = new Expector(
        "python3",
        ["-u", "-m", "gink", "-c", "ws://localhost:8087"],
        { env: { PYTHONPATH: "../python" } });
    await client.expect("connect");
    await server.expect("accepted");

    server.send("await root.set(3,4, 'test commit');\n");
    await server.expect("received commit", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("4", 1000);
    await sleep(100);

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });


