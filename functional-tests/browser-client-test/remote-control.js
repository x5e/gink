#!/usr/bin/env -S node
const CDP = require('chrome-remote-interface');

async function example() {
    let client;
    try {
        // connect to endpoint
        client = await CDP();
        // extract domains
        const { Network, Page, Runtime } = client;
        // setup handlers
        Network.requestWillBeSent((params) => {
            console.log(params.request.url);
        });
        // enable events then start!
        await Network.enable();
        await Page.enable();
        await Page.navigate({ url: 'http://127.0.0.1:8080/functional-tests/browser-client-test/' });
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
