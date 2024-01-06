const puppeteer = require('puppeteer');
const Expector = require("./Expector");
const { expect } = require('@jest/globals');
const { getLaunchOptions, sleep } = require("./browser_test_utilities");

it('connect to server and display dashboard', async () => {
    let browser = await puppeteer.launch(getLaunchOptions());
    let page = await browser.newPage();

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", ...process.env } });
    await sleep(1000);
    await server.expect("ready");

    page.on('console', async e => {
        const args = await Promise.all(e.args().map(a => a.jsonValue()));
    });

    await page.goto(`http://localhost:8081/`);
    await page.waitForSelector('#container-contents');

    await sleep(4000);

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
    /**
     * The idea here is to have two pages connected to the same server
     * that can both send commits and have them reflected in the other
     * page.
     */
    let browser = await puppeteer.launch(getLaunchOptions());
    let page1 = await browser.newPage();
    let page2 = await browser.newPage();
    const pages = [page1, page2];

    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", ...process.env } });
    await sleep(1000);
    await server.expect("ready");

    try {
        for (const page of pages) {
            await page.goto(`http://localhost:8081/`);
            await page.waitForSelector('#container-contents');

            await sleep(4000);

            const title = await page.$eval("#title-bar", e => e.innerHTML);
            expect(title).toMatch("Root Directory");
        }

        // Looks a little confusing but really this is a loop that goes:
        // Page1: set(key0, a value)
        // Page2: set(key1, a value)
        // Page1: set(key2, a value)
        // Page1: delete(key1)
        // Page2: set(key3, a value)
        // Page2: delete(key2)

        // This ensures the pages won't be missing any chain info after
        // the other sends a commit.
        for (let i = 0; i < 4; i++) {
            const page = pages[i % 2 == 0 ? 1 : 0];
            page
                .on('console', message =>
                    console.log(`${message.type().substring(0, 3).toUpperCase()} ${message.text()}`))
                .on('pageerror', ({ message }) => console.error(message));

            await page.evaluate(async (i) => {
                await window.instance.getGlobalDirectory().set(`key${i}`, 'a value', `setting key${i}`);
            }, i);

            if (i > 1) {
                await page.evaluate(async (i) => {
                    await window.instance.getGlobalDirectory().delete(`key${i - 1}`, `deleting key${i}`);
                }, i);
            }
            await sleep(4000);
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
}, 30000);
