const puppeteer = require('puppeteer');
const Expector = require("../Expector");
const { expect } = require('@jest/globals');
const { getLaunchOptions, sleep } = require("../browser_test_utilities");

it('connect to server and display bundles', async () => {
    let browser = await puppeteer.launch(getLaunchOptions());

    let page = await browser.newPage();

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8082", GINK_STATIC_PATH: ".", ...process.env } },
        false);
    await sleep(1000);
    await server.expect("ready");

    // For some reason if I don't handle console output, this test fails because
    // the messages aren't displayed properly..?
    // TODO: Figure out why the test fails without page.on('console')
    page.on('console', async e => {
        const args = await Promise.all(e.args().map(a => a.jsonValue()));
    });

    await page.goto('http://127.0.0.1:8082/integration-tests/browser-client-test/index.html');
    await page.waitForSelector('#messages');

    await sleep(4000);

    const messages = await page.$eval("#messages", e => e.innerHTML);

    await server.close();
    await browser.close();

    const expectedMessages = /Messages go here\..*Hello, Universe!.*/s;
    expect(messages).toMatch(expectedMessages);
}, 40000);
