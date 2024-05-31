#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
process.chdir(__dirname + "/..");
(async () => {
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: "8081", GINK_TOKEN: "abc", ...process.env } });
    await server.expect("ready", 2000);
    const client = new Expector("./tsc.out/implementation/main.js");
    await client.expect("node.gink", 2000);
    console.log("all ready");

    await client.send("await database.connectTo('ws://127.0.0.1:8081').catch((err)=>console.error('unable to connect'));\n");
    await client.expect("unable to connect", 2000);
    console.log("saw rejection");

    await client.send("await database.connectTo('ws://127.0.0.1:8081', {authToken:'abc'}).catch((err)=>console.error(err, 'unable to connect'));\n");
    await server.expect("Connection accepted.", 2000);
    console.log("correct token accepted");

    console.log("closing...");
    server.close();
    client.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
