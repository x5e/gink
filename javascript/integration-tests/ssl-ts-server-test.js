#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { sleep } = require("./browser_test_utilities");
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector(
        "./tsc.out/implementation/main.js",
        [
            "-l",
            port,
            "--ssl-cert",
            "/etc/ssl/certs/localhost.crt",
            "--ssl-key",
            "/etc/ssl/certs/localhost.key",
            "--verbose",
        ],
        {
            env: { ...process.env },
        },
    );
    await server.expect("Secure");
    await server.expect("ready");

    const client = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "--interactive",
        "-c",
        `wss://localhost:${port}`,
    ]);
    await client.expect("connect");
    await server.expect("accepted");
    await sleep(100);

    server.send("await root.set(3,4, 'test bundle');\n");
    await server.expect("added bundle");
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4.0\n");
    await sleep(100);

    await client.close();
    await server.close();
})();
