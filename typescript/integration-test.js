#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    console.log("starting");
    const server = new Expector("make server");
    await server.expect("ready", 6000);
    const client = new Expector("make instance");
    await client.expect("ready", 6000);
    console.log("all ready");

    server.send("hello\r\n");
    await client.expect(/received commit:.*hello/);

    client.send("world\r\n");
    await server.expect(/received commit:.*world/);

    await server.close();
    await client.close();
    console.log("ok!");
    //process.exit(0);
})().catch((reason) => {console.error(reason); process.exit(1);})
