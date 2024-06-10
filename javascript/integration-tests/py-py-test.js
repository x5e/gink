#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    const port = process.env.CURRENT_SAFE_PORT;
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "-l", `*:${port}`]
    );
    await server.expect("listen", 2000);

    const client = new Expector(
        "python3",
        ["-u", "-m", "gink", "-c", `ws://localhost:${port}`]
    );
    await client.expect("connect", 2000);
    await server.expect("accepted", 2000);

    server.send("Directory(arche=True).set(3,4);\n");
    await server.expect("Muid", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4\n", 1000);

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
