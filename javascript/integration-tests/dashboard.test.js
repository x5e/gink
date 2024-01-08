const puppeteer = require('puppeteer');
const Expector = require("./Expector");
const { expect } = require('@jest/globals');
const { getLaunchOptions, sleep } = require("./browser_test_utilities");

it('connect to server and display dashboard', async () => {
    let browser = await puppeteer.launch(getLaunchOptions()); // pass false to getLaunchOptions for local debugging.
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

    await sleep(4000);

    // Make sure server does not crash after page reload.
    try {
        await server.expect("got greeting from 2");
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
    let browser = await puppeteer.launch(getLaunchOptions()); // pass false to getLaunchOptions for local debugging.
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

            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            await sleep(2000);

            const title = await page.$eval("#title-bar", e => e.innerHTML);
            expect(title).toMatch("Root Directory");
        }

        // Looks a little confusing but really this loop does the following:
        // Page1: set(key0, a value)
        // Page2: set(key1, a value)
        // Page1: set(key2, a value)
        // Page1: delete(key1)
        // Page2: set(key3, a value)
        // Page2: delete(key2)
        // Page1: set(key0, updated value)

        // This ensures the pages won't be missing any chain info after
        // the other sends a commit.
        for (let i = 0; i < 4; i++) {
            const page = pages[i % 2 == 0 ? 1 : 0];
            await page.bringToFront();
            page
                .on('console', message =>
                    console.log(`${message.type().substring(0, 3).toUpperCase()} ${message.text()}`))
                .on('pageerror', ({ message }) => { throw new Error(message); });

            await page.click("#add-entry-button");
            await page.type("#key-input", `key${i}`);
            await page.type("#val-input", `a value`);
            await page.type("#msg-input", `setting key${i}`);
            await page.click("#commit-button");

            if (i > 1) {
                // Delete keys through dashboard UI
                await page.waitForXPath(`//td[contains(., 'key${i - 1}')]`);
                const [element] = await page.$x(`//td[contains(., 'key${i - 1}')]`);
                await element.click();
                await page.click("#delete-button");
            }
            await sleep(1000);
        }
        await page1.bringToFront();
        // Use the update button to update key0's value
        await page1.waitForXPath(`//td[contains(., 'key0')]`);
        const [element] = await page1.$x(`//td[contains(., 'key0')]`);
        await element.click();
        await page1.click("#update-button");
        await page1.evaluate(() => document.getElementById("val-input").value = "");
        await page1.type("#val-input", `changed value`);
        await page1.click("#commit-button");
        await sleep(1000);

        // Tables should both include the same keys and values:
        // key0: a value and key3: a value
        const table1 = await page1.$eval("#container-table", e => e.innerHTML);
        const table2 = await page2.$eval("#container-table", e => e.innerHTML);
        for (const table of [table1, table2]) {
            expect(table).toMatch(/.*<tr class="entry-row"><td>key0<\/td><td>changed value<\/td><\/tr>/);
            expect(table).not.toMatch(/.*key1/);
            expect(table).not.toMatch(/.*key2/);
            expect(table).toMatch(/.*<tr class="entry-row"><td>key3<\/td><td>a value<\/td><\/tr>/);
        }
    } catch (e) {
        throw new Error(e);
    } finally {
        await server.close();
        await browser.close();
    }
}, 40000 * 1000);
