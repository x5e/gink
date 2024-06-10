#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { Database } = require("../tsc.out/implementation/Database.js");
const { LogBackedStore } = require("../tsc.out/implementation/LogBackedStore.js");
const { getSafePort } = require("./browser_test_utilities.js");
/*
Logbacked1 <- Share File -> Logbacked2
                                v
                        In-Memory Listener PORT 8082

Ensures if logbacked1 changes the file, logbacked2 will
automatically pull the changes and broadcast them.
*/
process.chdir(__dirname + "/..");
(async () => {
    const port = getSafePort();
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: port, ...process.env } });
    await server.expect("listening", 10000);
    console.log("server started");

    const lbstore1 = new LogBackedStore("/tmp/test_peer.store");
    const instance1 = new Database(lbstore1);
    await instance1.ready;

    const lbstore2 = new LogBackedStore("/tmp/test_peer.store");
    const instance2 = new Database(lbstore2);
    await instance2.ready;
    await instance2.connectTo(`ws://localhost:${port}`);
    console.log("second store connected to server");

    await instance1.getGlobalDirectory().set("foo", "bar", "testing peer callback");
    console.log("wrote to first instance");

    await new Promise(r => setTimeout(r, 100));
    await server.expect(/received bundle:.*testing peer callback/, 10000);
    console.log("received expected bundle");

    await server.close();
    process.exit(0);
})().catch(async (reason) => {
    console.error(reason);
    await server.close();
    process.exit(1);
});
