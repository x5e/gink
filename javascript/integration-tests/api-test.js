#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");

function failed() {
    console.error("FAILED");
    process.exit(1);
}

(async () => {
    const port = process.env.CURRENT_SAFE_PORT ?? 8080;
    console.log("starting");
    const server = new Expector(
        "python3",
        ["-u", "-m", "gink", "--api_listen_on", `*:${port}`, "--auth_token", "abcd"]
    );
    await server.expect("listening", 2000);
    await sleep(500);

    // Try to put without auth
    const putFail = await fetch(`http://localhost:${port}/key1`, {
        method: "PUT",
        body: JSON.stringify({
            value: "this should fail",
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/json"
        }
    });
    if (putFail.status != 401) failed(); // Should fail

    // PUT a number in json format
    const put1 = await fetch(`http://localhost:${port}/key1`, {
        method: "PUT",
        body: JSON.stringify({
            value: 3,
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/json",
            "Authorization": "Bearer abcd"
        }
    });
    if (put1.status != 201) failed();

    // PUT a dict in json format
    const put2 = await fetch(`http://localhost:${port}/key2`, {
        method: "PUT",
        body: JSON.stringify({
            value: {
                a: 1,
                b: 2,
                c: 'test'
            },
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/json",
            "Authorization": "Bearer abcd"
        }
    });
    if (put2.status != 201) failed();

    // PUT plain text
    const put3 = await fetch(`http://localhost:${port}/key3`, {
        method: "PUT",
        body: JSON.stringify({
            value: "plain text test",
            comment: "test comment",
        }),
        headers: {
            "Content-type": "text/plain",
            "Authorization": "Bearer abcd"
        }
    });
    if (put3.status != 201) failed();

    // PUT binary data
    const put4 = await fetch(`http://localhost:${port}/key4`, {
        method: "PUT",
        body: JSON.stringify({
            value: "10001010",
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/octet-stream",
            "Authorization": "Bearer abcd"
        }
    });
    if (put4.status != 201) failed();

    const get1 = await (await fetch(`http://localhost:${port}/key1`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    if (get1 != 3) failed();

    const get2 = await (await fetch(`http://localhost:${port}/key2`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    if (JSON.stringify(get2) != JSON.stringify({
        a: 1,
        b: 2,
        c: 'test'
    })) failed();

    const get3 = await (await fetch(`http://localhost:${port}/key3`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    if (get3 != "plain text test") failed();

    const get4 = await fetch(`http://localhost:${port}/key4`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    );
    const get4Blob = await get4.blob();
    const get4Text = await get4Blob.text();
    if (get4Text != "10001010" || get4Blob.size != 8) failed();

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
