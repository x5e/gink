#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
process.chdir(__dirname + "/..");
let server = null;
let client = null;
let result = 1;
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    server = new Expector(
        "./tsc.out/implementation/main.js",
        ["-l", port, "--verbose"],
        { env: { ...process.env } },
    );
    await server.expect("SimpleServer.ready", 10000);
    client = new Expector("./tsc.out/implementation/main.js", [
        "-c",
        `ws://127.0.0.1:${port}/`,
        "--verbose",
    ]);
    await client.expect("connected!", 10000);
    console.log("all ready");

    server.send("var misc = await root.set('x', 'y', 'hello'); \r\n");
    console.log("sent");
    await client.expect("added bundle from 1");
    client.send("console.log(await root.get('x'));\n");
    await client.expect("y");
    console.log("received");
    client.send("var misc = await root.set('a', 'b', 'world'); \r\n");
    await server.expect("added bundle from 1");
    server.send("console.log(await root.get('a'));\n");
    await server.expect("b");

    console.log("closing...");
    console.log("ok!");
    result = 0;
})()
    .catch((reason) => {
        console.error(reason);
    })
    .finally(async () => {
        if (server) await server.close();
        if (client) await client.close();
        process.exit(result);
    });
