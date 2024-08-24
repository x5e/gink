const { existsSync } = require("fs");

function getLaunchOptions(headless = true) {
  if (headless === true) {
    headless = "new";
  } else {
    headless = false;
  }
  let launchOptions;
  let chromeLocation = process.env.CHROME_BIN;
  if (!chromeLocation) {
    if (existsSync("/usr/bin/chromium")) {
      chromeLocation = "/usr/bin/chromium";
    } else if (existsSync("/usr/bin/chromium-browser")) {
      chromeLocation = "/usr/bin/chromium-browser";
    }
  }
  // for this test to run as intended, set env CHROME_BIN
  // to the path to the chrome binary. Chromium works too.
  // ex: export CHROME_BIN=/bin/chromium-browser
  if (chromeLocation) {
    launchOptions = {
      executablePath: chromeLocation,
      headless: headless,
      args: ["--no-sandbox", "--disable-gpu"],
    };
  } else {
    // if path to chrome is not specified, try to find it.
    launchOptions = {
      product: "chrome",
      headless: headless,
      args: ["--no-sandbox", "--disable-gpu"],
    };
  }
  return launchOptions;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  getLaunchOptions: getLaunchOptions,
  sleep: sleep,
};
