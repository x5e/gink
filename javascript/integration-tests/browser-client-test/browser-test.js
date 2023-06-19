#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("../Expector");
const { spawnSync } = require("child_process");
function hasInstalled(program) {
    return !spawnSync(`which ${program}`, [], { shell: true }).status;
}
const browserCommand = hasInstalled('chromium') ? "chromium" : "google-chrome";
const browserArgs = [
    "--headless",
    "--no-sandbox",
    "--remote-debugging-port=9222",
    "--disable-gpu",
];
(async () => {
    console.log("starting");
    console.log(`${browserCommand} ${browserArgs.join(' ')}`);
    const browser = new Expector(browserCommand, browserArgs);
    const browsersAreSlow = new Promise(r => setTimeout(r, 1000));
    const server = new Expector("node", ["../../tsc.out/implementation/main.js"],
        {env: {GINK_PORT: "8080", GINK_STATIC_PATH: ".", ...process.env}});
    await browsersAreSlow;
    await server.expect("ready");
    const driver = new Expector(`${__dirname}/remote-control.js`, []);
    await driver.expect(/Server/, 10*1000);
    console.log("success!");

    server.close();
    browser.close();
    driver.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); })
