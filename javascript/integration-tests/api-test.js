#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");
(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--api_listen_on", `*:${port}`]
    );
    await server.expect("listening", 2000);
    await sleep(500);

    const post_result = await fetch(`http://localhost:${port}/key`, {
        method: "POST",
        body: JSON.stringify({
            value: 3,
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    });

    if (post_result.status != 201) {
        console.error("FAILED");
        process.exit(1);
    }

    const get_result = await (await fetch(`http://localhost:${port}/key`)).json();
    if (!(get_result == 3)) {
        console.error("FAILED");
        process.exit(1);
    }

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
