#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector("./tsc.out/implementation/main.js", ["-l", port], { env: { ...process.env } });
    await server.expect("ready", 2000);

    const client = new Expector(
        "python3",
        ["-u", "-m", "gink", "-c", `ws://localhost:${port}`]);
    await client.expect("connect");
    await server.expect("accepted");
    await sleep(100);

    server.send("await root.set(3,4, 'test bundle');\n");
    await server.expect("received bundle", 1000);
    await sleep(100);

    server.send("await root.set('date', new Date());\n");
    await server.expect("received bundle", 1000);
    await sleep(100);

    client.send("root.get(3);\n");
    await client.expect("\n4\n", 1000);
    await sleep(100);

    client.send("root.get('date');\n");
    await client.expect("datetime.datetime", 1000);
    await sleep(100);

    client.send("from datetime import datetime;\n");
    await sleep(100);
    client.send("root.set('date2', datetime.strptime('2024-07-11T11:45:34.319Z', '%Y-%m-%dT%H:%M:%S.%fZ'));\n");
    await sleep(100);

    server.send("await root.get('date2');\n");
    await sleep(100);
    await server.expect("2024-07-11T11:45:34.319Z", 1000);

    await client.close();
    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
