#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
process.chdir(__dirname + "/..");
let server = null;
let client = null;
let result = 1;
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    server = new Expector("./tsc.out/implementation/main.js", ["-l", port], { env: { ...process.env } });
    await server.expect("listening", 10000);
    client = new Expector("./tsc.out/implementation/main.js", ["-c", `ws://127.0.0.1:${port}/`]);
    await client.expect("using", 10000);
    console.log("all ready");

    server.send("var misc = await root.set('x', 'y', 'hello'); \r\n");
    console.log("sent");
    await client.expect(/received bundle:.*hello/);
    console.log("received");
    client.send("var misc = await root.set('a', 'b', 'world'); \r\n");
    await server.expect(/received bundle:.*world/);

    console.log("closing...");
    console.log("ok!");
    result = 0;
})().catch((reason) => {
    console.error(reason);
}).finally(
    async () => {
        await server.close();
        await client.close();
        process.exit(result);
    }
)
