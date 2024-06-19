const puppeteer = require('puppeteer');
const Expector = require("../Expector");
const { expect } = require('@jest/globals');
const { getLaunchOptions, sleep } = require("../browser_test_utilities");
process.chdir(__dirname + "/../..");
it('connect to server and display dashboard', async () => {
    const port = 9998;
    let browser, server;

    try {
        server = new Expector("node", ["./tsc.out/implementation/main.js", "-l", port],
            { env: { ...process.env } }, false);
        browser = await puppeteer.launch(getLaunchOptions()); // pass false to getLaunchOptions for local debugging.
        await sleep(1000);
        await server.expect("ready");
        let page = await browser.newPage();

        page.on('console', async e => {
            const args = await Promise.all(e.args().map(a => a.jsonValue()));
        });

        await page.goto(`http://localhost:${port}/`);
        await page.waitForSelector('#root', { timeout: 5000 });

        await sleep(4000);

        const title = await page.$eval("#title-bar", e => e.innerHTML);
        expect(title).toMatch("Root Directory");

        await page.reload();
        await server.expect("disconnected.");

        await sleep(4000);

        // Make sure server does not crash after page reload.
        await server.expect("got greeting from 2");
    } catch (e) {
        console.error(e);
        throw new Error(e);
    } finally {
        if (server) await server.close();
        if (browser) await browser.close();
    }
}, 40000);

it('share bundles between two pages', async () => {
    /**
     * The idea here is to have two pages connected to the same server
     * that can both send bundles and have them reflected in the other
     * page.
     */
    const port = 9999;
    let browser, server;
    try {
        server = new Expector("node", ["./tsc.out/implementation/main.js", "-l", port],
            { env: { ...process.env } }, false);
        browser = await puppeteer.launch(getLaunchOptions()); // pass false to getLaunchOptions for local debugging.
        await sleep(1000);
        await server.expect("ready");

        let page1 = await browser.newPage();
        let page2 = await browser.newPage();
        const pages = [page1, page2];

        for (const page of pages) {
            await page.goto(`http://localhost:${port}/`);
            await page.waitForSelector('#root', { timeout: 5000 });

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
        // the other sends a bundle.
        for (let i = 0; i < 4; i++) {
            const page = pages[i % 2 == 0 ? 1 : 0];
            await page.bringToFront();
            page.on('console', async e => {
                const args = await Promise.all(e.args().map(a => a.jsonValue()));
            });

            await page.click("#add-entry-button");
            await page.type("#key-input-1", `key${i}`);
            await page.type("#value-input", `a value`);
            await page.type("#comment-input", `setting key${i}`);
            await page.click("#bundle-button");

            if (i > 1) {
                // Delete keys through dashboard UI
                const xp = `::-p-xpath(//td[contains(., 'key${i - 1}')])`;
                const element = await page.waitForSelector(xp);
                await element.click();
                await page.click("#delete-button");
            }
            await sleep(1000);
        }
        await page1.bringToFront();
        // Use the update button to update key0's value
        const element = await page1.waitForSelector(`::-p-xpath(//td[contains(., 'key0')])`);
        await element.click();
        await page1.click("#update-button");
        await page1.type("#value-input", `changed value`);
        await page1.click("#bundle-button");
        await sleep(1000);

        // Tables should both include the same keys and values:
        // key0: a value and key3: a value
        const table1 = await page1.$eval("#container-table", e => e.innerHTML);
        const table2 = await page2.$eval("#container-table", e => e.innerHTML);
        for (const table of [table1, table2]) {
            expect(table).toMatch(/.*<tr class="entry-row" data-position="0"><td>key0<\/td><td>changed value<\/td><\/tr>/);
            expect(table).not.toMatch(/.*key1/);
            expect(table).not.toMatch(/.*key2/);
            expect(table).toMatch(/.*<tr class="entry-row" data-position="1"><td>key3<\/td><td>a value<\/td><\/tr>/);
        }
    } catch (e) {
        console.error(e);
        throw new Error(e);
    } finally {
        if (server) await server.close();
        if (browser) await browser.close();
    }
}, 40000);
