const puppeteer = require('puppeteer');
const Expector = require("./Expector");
const { expect } = require('@jest/globals');

it('connect to server and display dashboard', async () => {
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
        };
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
        };
    }
    let browser = await puppeteer.launch(launch_options);

    let page = await browser.newPage();

    const waitForMessages = new Promise(r => setTimeout(r, 1000));

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", ...process.env } });
    await waitForMessages;
    await server.expect("ready");

    // For some reason if I don't handle console output, this test fails because
    // the messages aren't displayed properly..?
    // TODO: Figure out why the test fails without page.on('console')
    page.on('console', async e => {
        const args = await Promise.all(e.args().map(a => a.jsonValue()));
    });

    await page.goto('http://127.0.0.1:8081/');
    await page.waitForSelector('#container-contents');

    // if you are using a RaspberryPi, or another low powered machine, make sure these are uncommented
    const slowMachine = new Promise(r => setTimeout(r, 3000));
    await slowMachine;

    await waitForMessages;

    const title = await page.$eval("#title-bar", e => e.innerHTML);
    expect(title).toMatch("Root Directory");


    await page.reload();
    await server.expect("Peer ::ffff:127.0.0.1 disconnected.");

    // Make sure server does not crash after page reload.
    try {
        await server.expect("got ack from 2");
    } catch (e) {
        throw new Error(e);
    } finally {
        await server.close();
        await browser.close();
    }
}, 13000);
