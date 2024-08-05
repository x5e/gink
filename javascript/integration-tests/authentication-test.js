#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
process.chdir(__dirname + "/..");

let result = 1;
let server;
let client;
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    server = new Expector(`./tsc.out/implementation/main.js`,
        ["-l", port, "--auth-token", "abc"], { ...process.env });
    await server.expect("ready", 2000);
    client = new Expector("./tsc.out/implementation/main.js");
    await client.expect("node.gink", 2000);
    console.log("all ready");

    client.send(`await database.connectTo('ws://127.0.0.1:${port}').catch((err)=>console.error('unable to connect'));\n`);
    await client.expect("unable to connect", 2000);
    console.log("saw rejection");

    client.send(`await database.connectTo('ws://127.0.0.1:${port}', {authToken:'abc'}).catch((err)=>console.error(err, 'unable to connect'));\n`);
    await server.expect("Connection accepted.", 2000);
    console.log("correct token accepted");

    console.log("ok!");
    result = 0;
})().catch((reason) => { console.error(reason); }).finally(async () => {
    if (server instanceof Expector)
        await server.close();
    if (client instanceof Expector)
        await client.close();
    process.exit(result);
});
