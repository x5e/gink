#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
const { MemoryStore } = require("../tsc.out/implementation/MemoryStore.js");
const { SimpleServer } = require("../tsc.out/implementation/SimpleServer.js");
const { Bundler } = require("../tsc.out/implementation/Bundler.js");

process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");

    const symKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        symKey[i] = i;
    }
    const store = new MemoryStore();
    const server = new SimpleServer(store, {
        port: port,
        logger: console.log,
        symmetricKey: symKey,
    });

    const client1 = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "-c",
        `ws://localhost:${port}`,
    ]);
    await client1.expect("connect");
    const symKeyHex = Buffer.from(symKey).toString("hex");
    const symKeyPythonFormat = `b'${symKeyHex
        .match(/.{1,2}/g)
        .map((byte) => "\\x" + byte)
        .join("")}'`;

    const root = server.getGlobalDirectory();
    const box = server.getGlobalBox();
    // Since the store was initialized with a symmetric key,
    // this entry will be encrypted
    // Also note this tests multiple changes in one encrypted bundle
    const bundler = new Bundler("test-encryption");
    await root.set("key1", "value1", bundler);
    await root.set("key2", "value2", bundler);
    await box.set("top secret", bundler);
    await server.addBundler(bundler);

    // Make sure the server cannot decrypt the data without the symmetric key
    // This will crash client1 with a KeyError
    client1.send("Box.get_global_instance().get()\n");
    await client1.expect(`KeyError`);

    const client2 = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "-c",
        `ws://localhost:${port}`,
    ]);
    await client2.expect("connect");

    // Assuming both parties have the symmetric key saved
    client2.send(`store.save_symmetric_key(${symKeyPythonFormat})\n`);
    await sleep(100);

    client2.send("Box.get_global_instance().get()\n");
    await client2.expect(`'top secret'`);
    client2.send("root.get('key1')\n");
    await client2.expect(`'value1'`);
    client2.send("root.get('key2')\n");
    await client2.expect(`'value2'`);

    // client1 has already crashed, so no need to close
    await client2.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
