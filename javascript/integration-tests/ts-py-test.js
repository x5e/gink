#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");

(async () => {
    console.log("starting");
    const python = new Expector(
        "python3",
        ["-u", "-m", "gink", "-l", "*:8085"]);
    await python.expect("listen");
    await sleep(100);

    const client = new Expector("./tsc.out/implementation/main.js", ["ws://localhost:8085"], { env: { ...process.env } });
    await client.expect("starting...");

    python.send("Directory(root=True).set(3,4);\n");
    await python.expect("Muid", 1000);

    await sleep(100);
    client.send("await root.get(3);\n");
    await client.expect("\n4\n");

    await client.close();
    await python.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
