function getLaunchOptions(headless = true) {
    if (headless == true) {
        headless = "new";
    } else {
        headless = false;
    }
    let launchOptions;
    // for this test to run as intended, set env CHROME_BIN
    // to the path to the chrome binary. Chromium works too.
    // ex: export CHROME_BIN=/bin/chromium-browser
    if (process.env.CHROME_BIN) {
        launchOptions = {
            executablePath: process.env.CHROME_BIN,
            headless: headless,
            args: [
                "--no-sandbox",
                "--disable-gpu",
            ]
        };
    }
    else {
        // if path to chrome is not specified, try to find it.
        launchOptions = {
            product: 'chrome',
            headless: headless,
            args: [
                "--no-sandbox",
                "--disable-gpu",
            ]
        };
    }
    return launchOptions;
};

let currentPort = 8080;
function getSafePort() {
    return `${currentPort++}`;
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
};

module.exports = {
    getLaunchOptions: getLaunchOptions,
    sleep: sleep,
    getSafePort: getSafePort
};
