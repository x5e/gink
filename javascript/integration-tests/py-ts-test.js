#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
let client = null;
let server = null;
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    server = new Expector(
        "./tsc.out/implementation/main.js",
        ["-l", port, "--verbose"],
        { env: { ...process.env } },
    );
    await server.expect("node.gink", 2000);

    client = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "--line_mode",
        "-c",
        `ws://localhost:${port}`,
    ]);
    await client.expect("connect");
    await server.expect("accepted");
    await sleep(100);

    server.send("await root.set(3,4, {comment:'test bundle'});\n");
    await server.expect("added bundle", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4.0\n", 1000);
    await sleep(100);

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch(async (reason) => {
    if (client) await client.close();
    if (server) await server.close();
    console.error(reason);
    process.exit(1);
});
