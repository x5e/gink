const puppeteer = require('puppeteer');
const Expector = require("./Expector");
const { expect } = require('@jest/globals');
const getLaunchOptions = require("./browser_test_utilities");

it('connect to server and display dashboard', async () => {
    let browser = await puppeteer.launch(getLaunchOptions());
    let page = await browser.newPage();

    const waitForMessages = new Promise(r => setTimeout(r, 1000));

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", ...process.env } });
    await waitForMessages;
    await server.expect("ready");

    page.on('console', async e => {
        const args = await Promise.all(e.args().map(a => a.jsonValue()));
    });

    await page.goto(`http://localhost:8081/`);
    await page.waitForSelector('#container-contents');

    const slowMachine = new Promise(r => setTimeout(r, 4000));
    await slowMachine;

    const title = await page.$eval("#title-bar", e => e.innerHTML);
    expect(title).toMatch("Root Directory");

    await page.reload();
    await server.expect("disconnected.");

    // Make sure server does not crash after page reload.
    try {
        await server.expect("commit from 2:");
    } catch (e) {
        throw new Error(e);
    } finally {
        await server.close();
        await browser.close();
    }
}, 13000);

it('share commits between two pages', async () => {
    let browser = await puppeteer.launch(getLaunchOptions());
    let page1 = await browser.newPage();
    let page2 = await browser.newPage();
    const pages = [page1, page2];

    const waitForMessages = new Promise(r => setTimeout(r, 1000));

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", ...process.env } });
    await waitForMessages;
    await server.expect("ready");

    for (let i = 0; i < 4; i++) {
        const page = pages[i % 2 == 0 ? 1 : 0];
        page
            .on('console', message =>
                console.log(`${message.type().substring(0, 3).toUpperCase()} ${message.text()}`))
            .on('pageerror', ({ message }) => console.error(message));

        await page.goto(`http://localhost:8081/`);
        await page.waitForSelector('#container-contents');

        const slowMachine = new Promise(r => setTimeout(r, 4000));
        await slowMachine;

        const title = await page.$eval("#title-bar", e => e.innerHTML);
        expect(title).toMatch("Root Directory");

        await page.evaluate(async (i) => {
            const globalDir = window.instance.getGlobalDirectory();
            await globalDir.set(`key${i}`, 'a value');
        }, i);

        if (i > 1) {
            await page.evaluate(async (i) => {
                const globalDir = window.instance.getGlobalDirectory();
                await globalDir.delete(`key${i - 1}`);
            }, i);
        }
        await slowMachine;
    }

    const expectedContents = `<tbody><tr>
                            <th>Key</th>
                            <th>Value</th>
                            </tr></tbody>
                            <tr class="entry-row">
                                <td data-state="long">key0</td>
                                <td data-state="long">a value</td>
                            </tr>
                            <tr class="entry-row">
                                <td data-state="long">key3</td>
                                <td data-state="long">a value</td>
                            </tr>`.replace(/\s/g, '');

    try {
        // Tables should both include the same keys and values:
        // key0: a value and key3: a value
        const table1 = await page1.$eval("#container-table", e => e.innerHTML);
        const table2 = await page2.$eval("#container-table", e => e.innerHTML);
        expect(table1.replace(/\s/g, '')).toMatch(expectedContents);
        expect(table2.replace(/\s/g, '')).toMatch(expectedContents);
    } catch (e) {
        throw new Error(e);
    } finally {
        await server.close();
        await browser.close();
    }
}, 20000);
