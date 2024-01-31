#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: "8080", GINK_AUTH_KEY: "abc", ...process.env } });
    await server.expect("ready", 1000);
    const client = new Expector("./tsc.out/implementation/main.js");
    await client.expect("node.gink", 1000);
    console.log("all ready");

    await client.send("database.connectTo('ws://127.0.0.1:8080').catch((err)=>console.error('unable to connect'));\n");
    await client.expect("unable to connect", 1000);
    console.log("saw rejection");

    console.log("closing...");
    server.close();
    client.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
