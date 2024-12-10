const puppeteer = require("puppeteer");
const Expector = require("../Expector");
const { expect } = require("@jest/globals");
const { getLaunchOptions, sleep } = require("../browser_test_utilities");
process.chdir(__dirname + "/../..");

jest.retryTimes(2);

it("share bundles between two pages", async () => {
    /**
     * The idea here is to have two pages connected to the same server
     * that can both send bundles and have them reflected in the other
     * page.
     */
    const port = 9999;
    let browser, server;
    try {
        server = new Expector(
            "node",
            ["./tsc.out/implementation/main.js", "-l", port],
            { env: { ...process.env } },
            false,
        );
        browser = await puppeteer.launch(getLaunchOptions()); // pass false to getLaunchOptions for local debugging.
        await sleep(1000);
        await server.expect("ready");

        let page1 = await browser.newPage();
        let page2 = await browser.newPage();

        for (const page of [page1, page2]) {
            page.on("console", async (e) => {
                const args = await Promise.all(
                    e.args().map((a) => a.jsonValue()),
                );
            });
            page.on("dialog", async (dialog) => {
                await dialog.accept();
            });
            await page.goto(`http://localhost:${port}/`);
            await page.waitForSelector("#root", { timeout: 5000 });

            await sleep(2000);

            const title = await page.$eval("#title-bar", (e) => e.innerHTML);
            expect(title).toMatch("Root Directory");
        }

        await page1.reload();
        await server.expect("disconnected.", 2000);

        // Make sure server does not crash after page reload.
        await server.expect("got greeting", 5000);

        // This ensures the pages won't be missing any chain info after
        // the other sends a bundle.

        await page1.bringToFront();
        // Add an entry of key1, a value
        (await page1.waitForSelector("#add-entry-button")).evaluate((e) =>
            e.click(),
        );
        await sleep(500);
        await page1.type("#key-input-1", `key0`);
        await sleep(500);
        await page1.type("#value-input", `a value`);
        await sleep(500);
        await page1.type("#comment-input", `setting key0`);
        await sleep(500);
        (await page1.waitForSelector("#bundle-button")).evaluate((e) =>
            e.click(),
        );
        await sleep(500);

        await page2.bringToFront();
        const element1 = await page2.waitForSelector(
            `::-p-xpath(//td[contains(., 'key0')])`,
        );
        await element1.click();
        (await page2.waitForSelector("#update-button")).evaluate((e) =>
            e.click(),
        );
        await page2.type("#value-input", `changed value`);
        (await page2.waitForSelector("#bundle-button")).evaluate((e) =>
            e.click(),
        );
        await sleep(1000);

        await page1.bringToFront();
        const element2 = await page1.waitForSelector(
            `::-p-xpath(//td[contains(., 'changed value')])`,
        );
        await element2.evaluate((e) => e.click());
        const deleteBtn = await page1.waitForSelector("#delete-button");
        await deleteBtn.evaluate((btn) => btn.click());
        await sleep(500);

        // Tables should both include the same keys and values:
        const table1 = await page1.$eval("#root", (e) => e.innerHTML);
        const table2 = await page2.$eval("#root", (e) => e.innerHTML);
        expect(table1).toMatch(/.*No entries\./);
        expect(table1).not.toMatch(/.*key0/);
        expect(table2).toMatch(/.*No entries\./);
        expect(table2).not.toMatch(/.*key0/);
    } catch (e) {
        console.error(e);
        throw new Error(e);
    } finally {
        if (server) await server.close();
        if (browser) await browser.close();
    }
}, 40000);
