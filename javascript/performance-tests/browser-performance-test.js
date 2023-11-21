#!/usr/bin/env node

const puppeteer = require('puppeteer');
const Expector = require("../integration-tests/Expector");

async function test_browser_performance() {
    const server = new Expector("node", ["javascript/tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", GINK_STATIC_PATH: ".", ...process.env } });
    await server.expect("ready");
    const all_results = {}
    for (const product of ["chrome", "firefox"]) {
        console.log(`Testing ${product}...`);
        let browser = await puppeteer.launch({
            product: product,
            headless: "new",
        });
        let page = await browser.newPage();
        page
            .on('console', message =>
                console.log(`${product}: ${message.text()}`))

        await page.goto('http://127.0.0.1:8081/javascript/performance-tests/performance_tests.html');
        await page.waitForSelector('#done', { timeout: 0 });

        let results = await page.$eval("#results", e => e.innerHTML);
        let results_obj = JSON.parse(results);
        all_results[product] = results_obj;
        await browser.close();
    }
    // wrapping in try/catch to avoid error when closing server.
    // should probably eventually figure out why unhandledPromiseRejection is happening
    try {
        await server.close();
    }
    catch { }
    console.log("Browser performance tests finished.")
    return all_results;
}

if (require.main == module) {
    const { ArgumentParser } = require('argparse');
    const fs = require('fs');

    const parser = new ArgumentParser();
    parser.add_argument("-o", "--output", { help: "json file to save output. default to no file, stdout" });
    const args = parser.parse_args();
    (async () => {
        const results = await test_browser_performance();
        if (args.output) {
            try {
                const fileData = fs.readFileSync(args.output)
                data = JSON.parse(fileData);
                data["gink_chrome"] = results["chrome"];
                data["gink_firefox"] = results["firefox"];
            }
            catch {
                data = {
                    "gink_chrome": results["chrome"],
                    "gink_firefox": results["firefox"]
                }
            }
            fs.writeFileSync(args.output, JSON.stringify(data));
        }
    })();
}