const puppeteer = require('puppeteer');
const Expector = require("../Expector");
const { expect } = require('@jest/globals');

it('connect to server and display commits', async () => {
    let launch_options;
    // for this test to run as intended, set env CHROME_BIN
    // to the path to the chrome binary. Chromium works too.
    // ex: export CHROME_BIN=/bin/chromium-browser
    if (process.env.CHROME_BIN) {
        launch_options = {
            executablePath: process.env.CHROME_BIN,
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-gpu",
            ]
        }
    }
    else {
        // if path to chrome is not specified, try to find it.
        launch_options = {
            product: 'chrome',
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-gpu",
            ]
        }
    }
    let browser = await puppeteer.launch(launch_options);

    let page = await browser.newPage();

    const waitForMessages = new Promise(r => setTimeout(r, 1000));

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", GINK_STATIC_PATH: ".", ...process.env } });
    await waitForMessages;
    await server.expect("ready");

    // For some reason if I don't handle console output, this test fails because
    // the messages aren't displayed properly..?
    // TODO: Figure out why the test fails without page.on('console')
    page.on('console', async e => {
        const args = await Promise.all(e.args().map(a => a.jsonValue()));
    });

    await page.goto('http://127.0.0.1:8081/integration-tests/browser-client-test');
    await page.waitForSelector('#messages');

    // if you are using a RaspberryPi, or another low powered machine, uncomment these.
    // const rpiIsSlow = new Promise(r => setTimeout(r, 3000));
    // await rpiIsSlow;

    await waitForMessages;

    const messages = await page.$eval("#messages", e => e.innerHTML);

    const expectedMessages = /Messages go here\..*Hello, Universe!.*start: SimpleServer/s
    expect(messages).toMatch(expectedMessages);

    server.close();
    browser.close();
}, 13000)
