#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const python = new Expector(
        "python3",
        ["-u", "-m", "gink", "-l", `*:${port}`]);
    await python.expect("listen", 2000);
    await sleep(500);

    const client = new Expector("node", ["./tsc.out/implementation/main.js", "-c", `ws://0.0.0.0:${port}`],
        { env: { ...process.env } });
    await python.expect("connection established!", 2000);
    await client.expect("connected!", 2000);

    python.send("Directory(arche=True).set(3,4);\n");
    await python.expect("Muid", 2000);

    await sleep(100);
    client.send("await root.get(3);\n");
    await client.expect("\n4n\n", 2000);

    await client.close();
    await python.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
