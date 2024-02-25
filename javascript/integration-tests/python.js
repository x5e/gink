#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async() => {
    console.log("starting");
    const python = new Expector(
        "python3",
        ["-u", "-m", "gink"],
        {env: {PYTHONPATH: "./python"}})
    python.expect("in-memory");
    python.send("Directory(root=True).set(3,4);\n");
    python.expect("Muid");
    await python.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
