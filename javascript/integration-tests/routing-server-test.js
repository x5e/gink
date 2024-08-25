#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { Database, IndexedDbStore } = require("../tsc.out/implementation");
process.chdir(__dirname + "/..");
(async function () {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    new Expector("rm", ["-rf", "/tmp/routing-server-test"]);
    new Expector("mkdir", ["-p", "/tmp/routing-server-test"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    let server;
    if (!process.env["GINK_DEBUG"]) {
        server = new Expector(
            "./tsc.out/implementation/main.js",
            ["-l", port, "--data-root", "/tmp/routing-server-test"],
            { env: { ...process.env } }
        );

        await server.expect("RoutingServer ready", 2000);
    }

    // This test ensures that it can connect to two different paths and write data
    // that will only be seen in the future by clients connecting to the same path.

    const firstAbcStore = new IndexedDbStore("firstAbc");
    const firstAbcInstance = new Database(firstAbcStore, undefined, (msg) =>
        console.log("firstAbc: " + msg)
    );
    const firstAbcPeer = await firstAbcInstance.connectTo(
        `ws://127.0.0.1:${port}/abc`
    );
    const firstAbcDir = firstAbcInstance.getGlobalDirectory();
    const change = await firstAbcDir.set("abc", 123, "firstAbc");
    const valueAfterSet = await firstAbcDir.get("abc");
    if (valueAfterSet !== 123)
        throw new Error(`valueAfterSet=${valueAfterSet}`);
    await firstAbcPeer.hasMap?.waitTillHas(change);
    await firstAbcInstance.close();

    const firstXyzInstance = new Database(
        new IndexedDbStore("firstXyz"),
        "firstXyz@identity",
        (msg) => console.log("firstXyz: " + msg)
    );
    const firstXyzPeer = await firstXyzInstance.connectTo(
        `ws://127.0.0.1:${port}/xyz`
    );
    const firstXyzDir = firstXyzInstance.getGlobalDirectory();
    console.log(await firstXyzInstance.store.getClaimedChains());
    const xyzChange = await firstXyzDir.set("xyz", 789, "firstXyz");
    await firstXyzPeer.hasMap?.waitTillHas(xyzChange);
    await firstXyzInstance.close();

    const secondAbcInstance = new Database(
        new IndexedDbStore("secondAbc"),
        undefined,
        (msg) => console.log("secondAbc: " + msg)
    );
    await secondAbcInstance.connectTo(`ws://127.0.0.1:${port}/abc`);
    // TODO: Add a way to ask to wait until instances are caught up with each other.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const secondAbcDir = secondAbcInstance.getGlobalDirectory();
    const v1 = await secondAbcDir.get("abc");
    if (v1 !== 123) throw new Error(`value not there? ${v1}`);
    const v2 = await secondAbcDir.get("xyz");
    if (v2 !== undefined) throw new Error("data shouldn't be there");
    await secondAbcInstance.close();

    const secondXyzStore = new IndexedDbStore("secondXyz");
    const secondXyzInstance = new Database(
        secondXyzStore,
        "secondXyz@identity",
        (msg) => console.log("secondXyz: " + msg)
    );
    await secondXyzInstance.connectTo(`ws://127.0.0.1:${port}/xyz`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const secondXyzDir = secondXyzInstance.getGlobalDirectory();
    const v3 = await secondXyzDir.get("abc");
    if (v3 !== undefined) throw new Error("abc shouldn't be set in xyz");
    const v4 = await secondXyzDir.get("xyz");
    if (v4 !== 789) throw new Error(`I expected xyz to be set, but was ${v4}`);
    await secondXyzInstance.close();

    console.log("finished routing server test");
    if (server) {
        await server.close();
    }
    process.exit(0);
})();
