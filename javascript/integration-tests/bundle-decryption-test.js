#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const {
    sleep,
    makeChainStart,
    extendChainWithoutSign,
    keyPair,
} = require("./browser_test_utilities.js");
const { MemoryStore } = require("../tsc.out/implementation/MemoryStore.js");
const { SimpleServer } = require("../tsc.out/implementation/SimpleServer.js");
const { Decomposition } = require("../tsc.out/implementation/Decomposition.js");
const { randombytes_buf } = require("libsodium-wrappers");
const {
    encryptMessage,
    wrapValue,
    muidToBuilder,
    signBundle,
} = require("../tsc.out/implementation/utils.js");
const {
    ChangeBuilder,
    EntryBuilder,
    Behavior,
} = require("../tsc.out/implementation/builders.js");
const { Bundler } = require("../tsc.out/implementation/Bundler.js");

process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const store = new MemoryStore();
    const server = new SimpleServer(store, { port: port, logger: console.log });

    const client = new Expector("python3", [
        "-u",
        "-m",
        "gink",
        "-c",
        `ws://localhost:${port}`,
    ]);
    await client.expect("connect");
    await sleep(100);

    // const symKey = randombytes_buf(32);
    const arr = [];
    for (let i = 0; i < 32; i++) {
        arr.push(Math.floor(Math.random() * 256));
    }
    const symKey = Buffer.from(arr);
    const id = await store.saveSymmetricKey(symKey);

    const chainStart = await makeChainStart(
        "Hello, World!",
        425579549941797,
        Date.parse("2022-02-19 23:24:50") * 1000
    );
    await store.addBundle(chainStart);
    const bundler = new Bundler("test-encryption");

    const changeBuilder = new ChangeBuilder();
    const entryBuilder = new EntryBuilder();
    entryBuilder.setBehavior(Behavior.BOX);
    entryBuilder.setContainer(
        muidToBuilder({ medallion: -1, timestamp: -1, offset: 1 })
    );
    entryBuilder.setValue(wrapValue("top secret"));
    changeBuilder.setEntry(entryBuilder);
    const encrypted = encryptMessage(changeBuilder.serializeBinary(), symKey);
    bundler.addEncryptedChange(encrypted, id);
    await server.addBundler(bundler);
    await sleep(200);

    // client.send("Box.get_global_instance().get()\n");

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
