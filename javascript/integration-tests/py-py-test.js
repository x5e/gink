#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");

(async () => {
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "-l", "*:8086"],
        { env: { PYTHONPATH: "./python" } });
    await server.expect("listen");

    const client = new Expector(
        "python3",
        ["-u", "-m", "gink", "-c", "ws://localhost:8086"],
        { env: { PYTHONPATH: "./python" } });
    await client.expect("connect");
    await server.expect("accepted");

    server.send("Directory(root=True).set(3,4);\n");
    await server.expect("Muid", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4\n", 1000);

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });


