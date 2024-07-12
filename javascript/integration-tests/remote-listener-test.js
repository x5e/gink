#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { Database, ensure } = require("../tsc.out/implementation/index.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting remote listener test");
    const server = new Expector("./tsc.out/implementation/main.js", ["-l", port], { env: { ...process.env } }, false);
    await server.expect("ready", 2000);

    const client1 = new Database();
    await client1.connectTo(`ws://localhost:${port}`);
    const client2 = new Database();
    await client2.connectTo(`ws://localhost:${port}`);

    await sleep(200);
    console.log("connections established");

    const remoteListener = (x, y) => {
        remoteListener.calledTimes++;
    };
    remoteListener.calledTimes = 0;

    const client1Root = client1.getGlobalDirectory();
    const client2Root = client2.getGlobalDirectory();

    // Add a remote only listener
    client1.addListener(remoteListener, client1Root.address, true);

    await client1Root.set("1", "2");
    ensure(remoteListener.calledTimes === 0);
    // Should not have been called, since client1 is only subscribed to remote changes

    await client2Root.set("2", "3");
    await sleep(200);
    ensure(remoteListener.calledTimes === 1);
    // Only subscribed to remote changes, so a remote bundle should call the listener
    console.log("correctly called listener only on remote bundle. finished!");

    await client1.close();
    await client2.close();
    await server.close();

})();
