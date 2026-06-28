#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { Database } = require("../tsc.out/implementation/Database.js");
const {
    LogBackedStore,
} = require("../tsc.out/implementation/LogBackedStore.js");
const { Directory } = require("../tsc.out/implementation/Directory.js");
const { unlinkSync, existsSync } = require("fs");
/*
Logbacked1 <- Share File -> Logbacked2
                                v
                        In-Memory Listener

Ensures if logbacked1 changes the file, logbacked2 will
automatically pull the changes and broadcast them.
*/
process.chdir(__dirname + "/..");
let server = null;
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
    console.log("server started");

    const path = "/tmp/test_peer.store";

    if (existsSync(path)) unlinkSync(path);
    const lbstore1 = new LogBackedStore(path);
    const instance1 = new Database({ store: lbstore1 });
    await instance1.ready;

    const lbstore2 = new LogBackedStore(path);
    const instance2 = new Database({ store: lbstore2 });
    await instance2.ready;
    await instance2.connectTo(`ws://localhost:${port}`);
    console.log("second store connected to server");

    await Directory.get(instance1).set("foo", "bar", "testing peer callback");
    console.log("wrote to first instance");

    await server.expect("added bundle from 1", 10000);
    server.send('console.log(await root.get("foo"));\n');
    await server.expect("bar");
    console.log("received expected bundle");
    result = 0;
})()
    .catch(async (reason) => {
        console.error(reason);
    })
    .finally(async () => {
        if (server) await server.close();
        process.exit(result);
    });
