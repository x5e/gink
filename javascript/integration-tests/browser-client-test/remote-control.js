#!/usr/bin/env -S node
const CDP = require('chrome-remote-interface');

async function example() {
    let client;
    try {
        const { target } = await CDP.New();
        // connect to endpoint
        client = await CDP({target:target});
        console.log(client);
        // extract domains
        const { Network, Page, Runtime } = client;
        // setup handlers
        Network.requestWillBeSent((params) => {
            console.log(params.request.url);
        });
        // enable events then start!
        await Network.enable();
        await Page.enable();
        // console.log(Page)
        await Page.navigate({ url: 'http://127.0.0.1:8080/integration-tests/browser-client-test' });
	    await Page.loadEventFired();
        await new Promise(r => setTimeout(r, 1000));
        const expr = "document.getElementById('messages').innerHTML";
        const evaluated = (await Runtime.evaluate({ "expression": expr }));
        console.log(evaluated.result.value);
    } catch (err) {
        console.error(err);
    } finally {
        if (client) {
            console.log("closing...");
            await client.close();
        }
    }
}

example();
