#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { GinkInstance } = require("../tsc.out/implementation/GinkInstance.js");
const { ensure } = require("../tsc.out/implementation/utils.js");

(async () => {
    console.log("starting");
    const python = new Expector(
        "python3",
        ["-u", "-m", "gink", "-l", "*:8085"],
        { env: { PYTHONPATH: "./python" } });
    await python.expect("listen");

    const client = new GinkInstance();
    await client.connectTo("ws://localhost:8085");

    // Error only happens when a Python instance sets an integer as a value.
    python.send("Directory(root=True).set(3,4);\n");
    await python.expect("Muid", 1000);

    ensure(await client.getGlobalDirectory().get(3) === 4);

    await python.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
