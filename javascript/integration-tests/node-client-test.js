#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: "8080", ...process.env } });
    await server.expect("node+gink", 60000);
    const client = new Expector("./tsc.out/implementation/main.js", ["ws://127.0.0.1:8080/"]);
    await client.expect("node+gink", 60000);
    console.log("all ready");

    server.send("var misc = await root.set('x', 'y', 'hello'); \r\n");
    console.log("sent");
    await client.expect(/received commit:.*hello/);
    console.log("received");
    client.send("var misc = await root.set('a', 'b', 'world'); \r\n");
    await server.expect(/received commit:.*world/);

    console.log("closing...");
    server.close();
    client.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
