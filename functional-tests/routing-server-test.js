#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const { GinkInstance, IndexedDbStore } = require("../tsc.out/");
(async function () {
    const directoryMaker = new Expector("mkdir", ["-p", "/tmp/routing-server-test"]);
    await directoryMaker.close();
    if (!process.env["GINK_DEBUG"]) {
    const server = new Expector("./tsc.out/main.js", [],
        { env: { GINK_PORT: "8080", GINK_DATA_ROOT: "/tmp/routing-server-test/", ...process.env } });

    await server.expect("RoutingServer ready");
    }

    // This test ensures that it can connect to two different paths and write data
    // that will only be seen in the future by clients connecting to the same path.

    const firstAbcInstance = new GinkInstance(new IndexedDbStore("firstAbc"),{},(msg) => console.log('firstAbc: ' + msg));
    let peer = await firstAbcInstance.connectTo("ws://127.0.0.1:8080/abc");
    await peer.ready;
    const firstAbcDir = firstAbcInstance.getGlobalDirectory();
    await firstAbcDir.set("abc", 123);
    await firstAbcInstance.close();

    const firstXyzInstance = new GinkInstance(new IndexedDbStore("firstXyz"),{},(msg) => console.log('firstXyz: ' + msg));
    peer = await firstXyzInstance.connectTo("ws://127.0.0.1:8080/xyz");
    await peer.ready;
    const firstXyzDir = firstXyzInstance.getGlobalDirectory();
    await firstXyzDir.set("xyz", 789);
    await firstXyzInstance.close();

    const secondAbcInstance = new GinkInstance(new IndexedDbStore("secondAbc"),{},(msg) => console.log('secondAbc: ' + msg));
    peer = await secondAbcInstance.connectTo("ws://127.0.0.1:8080/abc");
    await new Promise((resolve) => {setTimeout(resolve, 1000);});
    const secondAbcDir = secondAbcInstance.getGlobalDirectory();
    const v1 = await secondAbcDir.get("abc");
    if (v1 !== 123) throw new Error(`value not there? ${v1}`);
    const v2 = await secondAbcDir.get("xyz");
    if (v2 !== undefined) throw new Error("data shouldn't be there");

    const secondXyzInstance = new GinkInstance(new IndexedDbStore("secondXyz"),{},(msg) => console.log('secondXyz: ' + msg));
    await secondXyzInstance.connectTo("ws://127.0.0.1:8080/xyz");
    await new Promise((resolve) => {setTimeout(resolve, 1000);});
    const secondXyzDir = secondXyzInstance.getGlobalDirectory();
    const v3 = await secondXyzDir.get("abc");
    if (v3 !== undefined) throw new Error("abc shouldn't be set in xyz");
    const v4 = await secondXyzDir.get("xzy");
    if (v4 !== 789) throw new Error("I expected xyz to be set");

    console.log("finished routing server test");

})();