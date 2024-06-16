#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require('./Expector');
const { sleep } = require('./browser_test_utilities');
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], {
        env: {
            GINK_PORT: port,
            GINK_SSL_CERT: "/etc/ssl/certs/localhost.pem",
            GINK_SSL_KEY: "/etc/ssl/certs/localhost-key.pem",
            ...process.env
        }
    });
    await server.expect("Secure", 2000);
    await server.expect("ready", 2000);

    const client = new Expector(
        "python3",
        ["-u", "-m", "gink", "-c", `wss://localhost:${port}`]);
    await client.expect("connect");
    await server.expect("accepted");
    await sleep(100);

    server.send("await root.set(3,4, 'test bundle');\n");
    await server.expect("received bundle", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4\n", 1000);
    await sleep(100);

    await client.close();
    await server.close();
})();



