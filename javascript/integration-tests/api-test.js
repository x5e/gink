#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector.js");
const { sleep } = require("./browser_test_utilities.js");
process.chdir(__dirname + "/..");

function failed(msg = "") {
    console.error("FAILED", msg);
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
    const putFail = await fetch(`http://127.0.0.1:${port}/key1`, {
        method: "PUT",
        body: JSON.stringify({
            value: "this should fail",
            comment: "test comment",
        }),
        headers: {
            "Content-type": "application/json"
        }
    });
    if (putFail.status != 401) failed(`expected 401 got ${putFail.status}`); // Should fail

    // PUT a number in json format
    const put1 = await fetch(`http://127.0.0.1:${port}/key1`, {
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
    if (put1.status != 201) failed(`put1 expected 201 got ${put1.status}`);

    // PUT a dict in json format
    const put2 = await fetch(`http://127.0.0.1:${port}/key2`, {
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
    if (put2.status != 201) failed(`put2 expected 201 got ${put2.status}`);

    // PUT plain text
    const put3 = await fetch(`http://127.0.0.1:${port}/key3`, {
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
    if (put3.status != 201) failed(`put3 expected 201 got ${put3.status}`);

    // PUT binary data
    const put4 = await fetch(`http://127.0.0.1:${port}/key4`, {
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
    if (put4.status != 201) failed(`put4 expected 201 got ${put4.status}`);

    const get1 = await (await fetch(`http://127.0.0.1:${port}/key1`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    if (get1 != 3) failed(`get1 expected 3 got ${get1}`);

    const get2 = await (await fetch(`http://127.0.0.1:${port}/key2`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    const expecting = JSON.stringify({
        a: 1,
        b: 2,
        c: 'test'
    });
    if (JSON.stringify(get2) != expecting) failed(`get2 expected ${expecting} got ${JSON.stringify(get2)}`);

    const get3 = await (await fetch(`http://127.0.0.1:${port}/key3`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    )).json();
    if (get3 != "plain text test") failed(`get3 expected "plain text test" got ${get3}`);

    const get4 = await fetch(`http://127.0.0.1:${port}/key4`,
        {
            headers: {
                "Authorization": "Bearer abcd"
            }
        }
    );
    const get4Blob = await get4.blob();
    const get4Text = await get4Blob.text();
    if (get4Text != "10001010" || get4Blob.size != 8) failed(`get4 expected "10001010 got ${get4Text}`);

    await server.close();
    console.log("finished!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); });
