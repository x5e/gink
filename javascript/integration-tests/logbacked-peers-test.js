#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { GinkInstance } = require("../tsc.out/implementation/GinkInstance.js");
const { LogBackedStore } = require("../tsc.out/implementation/LogBackedStore.js");
(async () => {
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", [], { env: { GINK_PORT: "8081", ...process.env } });
    await server.expect("listening", 10000);
    console.log("server started");

    const lbstore1 = new LogBackedStore("/tmp/test_peer.store");
    const instance1 = new GinkInstance(lbstore1);

    const lbstore2 = new LogBackedStore("/tmp/test_peer.store");
    const instance2 = new GinkInstance(lbstore2);
    await instance2.connectTo("ws://localhost:8081");
    console.log("second store connected to server");

    await instance1.getGlobalDirectory().set("foo", "bar", "testing peer callback");
    console.log("wrote to first instance");
    await server.expect(/received commit:.*testing peer callback/);
    console.log("received expected commit");

    await server.close();
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
