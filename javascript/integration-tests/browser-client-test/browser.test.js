const puppeteer = require('puppeteer');
const Expector = require("../Expector");
const { expect } = require('@jest/globals');

test('connect to server and display commits', async () => {
    let browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-gpu",
        ]
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

    const expectedMessages = /Messages go here\..*Hello, Universe!.*start: SimpleServer/s
    expect(messages).toMatch(expectedMessages);

    server.close();
    browser.close();
}, 8000)
