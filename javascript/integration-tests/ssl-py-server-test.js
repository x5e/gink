#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { sleep } = require("./browser_test_utilities");
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "--line_mode",
        "-l",
        `*:${port}`,
        "--ssl-cert",
        "/etc/ssl/certs/localhost.crt",
        "--ssl-key",
        "/etc/ssl/certs/localhost.key",
    ]);
    await server.expect("secure", 2000);

    const client = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "--line_mode",
        "-c",
        `wss://localhost:${port}`,
    ]);
    await client.expect("connect");
    await server.expect("accepted");
    await sleep(100);

    server.send("root.set(3,4);\n");
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4\n", 1000);
    await sleep(100);

    await client.close();
    await server.close();
})();
