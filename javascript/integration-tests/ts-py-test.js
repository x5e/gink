#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const python = new Expector("python", [
        "-u",
        "-m",
        "gink",
        "--interactive",
        "-l",
        `*:${port}`,
    ]);
    await python.expect("listen");
    await sleep(500);

    const client = new Expector(
        "node",
        [
            "./tsc.out/implementation/main.js",
            "-c",
            `ws://0.0.0.0:${port}`,
            "--verbose",
            "--reconnect=true",
        ],
        { env: { ...process.env } },
    );
    await python.expect("connection established!");
    await client.expect("connected!");

    python.send("Directory(root=True).set(3,4);\n");
    await python.expect("Muid");

    await sleep(100);
    client.send("await root.get(3);\n");
    await client.expect("\n4n\n");

    await python.close();
    await client.close();
    console.log("finished!");
    process.exit(0);

    /*
    await client.close();

    await client.expect("reconnecting");

    const python2 = new Expector("python", [
        "-u",
        "-m",
        "gink",
        "--interactive",
        "-l",
        `*:${port}`,
    ]);
    await python2.expect("listen");

    await client.expect("got greeting");

    await client.close();
    await python2.close();
    */
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
