#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector(
        "python3",
        [
            "-u",
            "-m",
            "gink",
            "--loop",
            "--wsgi",
            "examples.crud.app",
            "--wsgi_listen_on",
            `127.0.0.1:${port}`,
        ],
        {
            env: {
                AUTH_TOKEN: "abcd",
                ...process.env,
            },
        },
    );
    await server.expect("listening");
    await sleep(1000);

    // Try to put without auth token
    const putFail = new Expector("curl", [
        "-X",
        "PUT",
        "-d",
        3,
        `http://127.0.0.1:${port}/key1`,
    ]);
    await putFail.expect("Bad auth token.");

    // PUT a number in json format
    const put1 = new Expector("curl", [
        "-X",
        "PUT",
        "-H",
        "Authorization: abcd",
        "-H",
        "Content-type: application/json",
        "-d",
        3,
        `http://127.0.0.1:${port}/key1`,
    ]);
    await put1.expect("Entry updated or created.");

    // PUT a dict in json format
    const put2 = new Expector("curl", [
        "-X",
        "PUT",
        "-H",
        "Authorization: Bearer abcd",
        "-H",
        "Content-type: application/json",
        "-d",
        `${JSON.stringify({
            a: 1,
            b: 2,
            c: "test",
        })}`,
        `http://127.0.0.1:${port}/key2`,
    ]);
    await put2.expect("Entry updated or created.");

    // PUT plain text
    const put3 = new Expector("curl", [
        "-X",
        "PUT",
        "-H",
        "Authorization: abcd",
        "-H",
        "Content-type: text/plain",
        "-d",
        `plain text test`,
        `http://127.0.0.1:${port}/key3`,
    ]);
    await put3.expect("Entry updated or created.");

    // PUT binary data
    const put4 = new Expector("curl", [
        "-X",
        "PUT",
        "-H",
        "Authorization: Bearer abcd",
        "-H",
        "Content-type: application/octet-stream",
        "-d",
        "10001010",
        `http://127.0.0.1:${port}/key4`,
    ]);
    await put4.expect("Entry updated or created.");

    // PUT None
    const put5 = new Expector("curl", [
        "-X",
        "PUT",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key5`,
    ]);
    await put5.expect("Entry updated or created.");

    const get1 = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key1`,
    ]);
    await get1.expect(3);

    const get2 = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key2`,
    ]);
    const regex =
        /{\s*"a"\s*:\s*1\s*,\s*"b"\s*:\s*2\s*,\s*"c"\s*:\s*"test"\s*}/;
    await get2.expect(regex);

    const get3 = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key3`,
    ]);
    await get3.expect("plain text test");

    const get4 = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key4`,
    ]);
    await get4.expect("10001010");

    const get5 = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key5`,
    ]);
    await get5.expect("null");

    const delete4 = new Expector("curl", [
        "-X",
        "DELETE",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key4`,
    ]);
    await delete4.expect("Entry deleted.");

    const get4Again = new Expector("curl", [
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer abcd",
        `http://127.0.0.1:${port}/key4`,
    ]);
    await get4Again.expect("Entry not found.");

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => {
    console.error(reason);
    process.exit(1);
});
