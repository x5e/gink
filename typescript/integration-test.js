#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    console.log("starting");
    const server = new Expector("make server");
    await server.expect("ready", 60000);
    const client = new Expector("make instance");
    await client.expect("ready", 60000);
    console.log("all ready");

    server.send("hello\r\n");
    console.log("sent");
    await client.expect(/received commit:.*hello/);
    console.log("received");
    client.send("world\r\n");
    await server.expect(/received commit:.*world/);

    console.log("closing...");
    server.close();
    client.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => {console.error(reason); process.exit(1);})
