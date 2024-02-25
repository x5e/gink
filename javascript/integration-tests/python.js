#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async() => {
    console.log("starting");
    const python = new Expector(
        "python3", ["-m", "gink", "/tmp/bunk.gink", ], {env: {PYTHONPATH: "./python"}})
    python.send("1+2\r\n");
    await python.expect("3", 100*1000);
    await python.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
