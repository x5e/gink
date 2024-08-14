const puppeteer = require("puppeteer");
const Expector = require("../Expector");
const { expect } = require("@jest/globals");
const { getLaunchOptions, sleep } = require("../browser_test_utilities");
process.chdir(__dirname + "/../..");

jest.retryTimes(2);

it("connect to server and display bundles", async () => {
    const port = 9997;

    let browser, server;
    try {
        server = new Expector(
            "node",
            [
                "./tsc.out/implementation/main.js",
                "-l",
                port,
                "--static-path",
                ".",
            ],
            { env: { ...process.env } },
            false
        );
        browser = await puppeteer.launch(getLaunchOptions());
        await sleep(1000);
        await server.expect("ready");

        let page = await browser.newPage();

        // For some reason if I don't handle console output, this test fails because
        // the messages aren't displayed properly..?
        // TODO: Figure out why the test fails without page.on('console')
        page.on("console", async (e) => {
            const args = await Promise.all(e.args().map((a) => a.jsonValue()));
        });
        await page.goto(
            `http://localhost:${port}/integration-tests/browser-tests/index.html`
        );
        await page.waitForSelector("#messages", { timeout: 5000 });

        await sleep(4000);

        const messages = await page.$eval("#messages", (e) => e.innerHTML);

        const expectedMessages = /Messages go here\..*Hello, Universe!.*/s;
        expect(messages).toMatch(expectedMessages);
    } catch (e) {
        console.error(e);
        throw new Error(e);
    } finally {
        if (server) await server.close();
        if (browser) await browser.close();
    }
}, 40000);
