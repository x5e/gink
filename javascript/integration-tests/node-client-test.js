#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
process.chdir(__dirname + "/..");
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", ["-l", port], { env: { ...process.env } });
    await server.expect("listening", 10000);
    const client = new Expector("./tsc.out/implementation/main.js", ["-c", `ws://127.0.0.1:${port}/`]);
    await client.expect("using", 10000);
    console.log("all ready");

    server.send("var misc = await root.set('x', 'y', 'hello'); \r\n");
    console.log("sent");
    await client.expect(/received bundle:.*hello/);
    console.log("received");
    client.send("var misc = await root.set('a', 'b', 'world'); \r\n");
    await server.expect(/received bundle:.*world/);

    console.log("closing...");
    await server.close();
    await client.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
