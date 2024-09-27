#!/usr/bin/env -S node --unhandled-rejections=strict
const { Database } = require("../tsc.out/implementation/Database.js");
const { MemoryStore } = require("../tsc.out/implementation/MemoryStore.js");
const { ensure } = require("../tsc.out/implementation/utils.js");
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");

process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");

    const symKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        symKey[i] = i;
    }

    const server = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "-l",
        `*:${port}`,
    ]);

    await server.expect("starting");
    const symKeyHex = Buffer.from(symKey).toString("hex");
    const symKeyPythonFormat = `b'${symKeyHex
        .match(/.{1,2}/g)
        .map((byte) => "\\x" + byte)
        .join("")}'`;
    // We can only run the python server through the Expector,
    // so we have to explicitly save the symmetric key since there
    // is currently no CLI flag to pass it in
    server.send(`database._symmetric_key = ${symKeyPythonFormat}\n`);
    await sleep(100);
    server.send(
        `database._symmetric_key_id = store.save_symmetric_key(${symKeyPythonFormat})\n`
    );
    await sleep(100);

    // The first client and store will ensure failure without a sym key
    const store1 = new MemoryStore();
    const client1 = new Database(store1);
    await client1.connectTo(`ws://0.0.0.0:${port}`);

    await server.expect("connection established!", 2000);
    server.send("bundler = Bundler('test-encryption')\n");
    await sleep(100);
    server.send("root.set('key1', 'value1', bundler=bundler)\n");
    await sleep(100);
    server.send("root.set('key2', 'value2', bundler=bundler)\n");
    await sleep(100);
    server.send("Box(arche=True).set('top secret', bundler=bundler)\n");
    await sleep(100);
    server.send("database.bundle(bundler)\n");
    await sleep(100);
    // Client should crash because it doesn't have the symmetric key
    await server.expect("got close msg");
    console.log("client correctly errored");

    const store2 = new MemoryStore();
    const client2 = new Database(store2, undefined, undefined, symKey);
    await client2.connectTo(`ws://0.0.0.0:${port}`);
    await server.expect("connection established!", 2000);
    // wait for bundles to sync
    await sleep(500);
    const root = client2.getGlobalDirectory();
    const box = client2.getGlobalBox();
    ensure((await root.get("key1")) === "value1");
    ensure((await root.get("key2")) === "value2");
    ensure((await box.get()) === "top secret");
    console.log("bundles successfully decrypted");

    await client2.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
