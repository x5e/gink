#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
const { MemoryStore } = require("../tsc.out/implementation/MemoryStore.js");
const { SimpleServer } = require("../tsc.out/implementation/SimpleServer.js");

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

    const client = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "-c",
        `ws://localhost:${port}`,
    ]);
    await client.expect("connect");
    const symKeyHex = Buffer.from(symKey).toString("hex");
    const symKeyPythonFormat = `b'${symKeyHex
        .match(/.{1,2}/g)
        .map((byte) => "\\x" + byte)
        .join("")}'`;

    // Assuming both parties have the symmetric key saved
    client.send(`store.save_symmetric_key(${symKeyPythonFormat})\n`);
    await sleep(100);

    // Since the store was initialized with a symmetric key,
    // this entry will be encrypted
    await server.getGlobalBox().set("top secret");
    client.send("Box.get_global_instance().get()\n");
    await client.expect(`'top secret'`);
    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
