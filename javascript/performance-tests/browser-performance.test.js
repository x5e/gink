const puppeteer = require('puppeteer');
const Expector = require("../integration-tests/Expector");

it('runs performance tests in chrome', async () => {
    let browser = await puppeteer.launch({
        product: "chrome",
        headless: false,
    });
    let page = await browser.newPage();
    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", GINK_STATIC_PATH: ".", ...process.env } });
    await server.expect("ready");
    await page.goto('http://127.0.0.1:8081/performance-tests/performance_tests.html');
    console.log("here");
    await page.waitForSelector('#results');

    server.close();
});

it('runs performance tests in firefox', async () => {
    // I had to run `apt install firefox-esr` to get this to work.
    let browser = await puppeteer.launch({
        product: "firefox",
        headless: false,
    });
    let page = await browser.newPage();
    const server = new Expector("node", ["./tsc.out/implementation/main.js"],
        { env: { GINK_PORT: "8081", GINK_STATIC_PATH: ".", ...process.env } });
    await server.expect("ready");
    await page.goto('http://127.0.0.1:8081/performance-tests/performance_tests.html');
    console.log("here");
    await page.waitForSelector('#results');

    server.close();
});