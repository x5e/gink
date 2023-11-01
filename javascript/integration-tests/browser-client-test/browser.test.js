const puppeteer = require('puppeteer');
const Expector = require("../Expector");
const { expect } = require('@jest/globals');

test('connect to server and display commits', async () => {
    let browser = await puppeteer.launch({
        product: "chrome",
        headless: "new",
    });
    let page = await browser.newPage();

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        {env: {GINK_PORT: "8081", GINK_STATIC_PATH: ".", ...process.env}});
    await server.expect("ready");

    await page.goto('http://127.0.0.1:8081/integration-tests/browser-client-test');
    await page.waitForSelector('#messages');

    const waitForMessages = new Promise(r => setTimeout(r, 1000));
    await waitForMessages;

    const messages = await page.$eval("#messages", e => e.innerHTML);
    expect(messages).toContain('Messages go here.');
    expect(messages).toContain('Hello, Universe!');
    expect(messages).toContain('start: SimpleServer');

    server.close();
    browser.close();
}, 8000)
