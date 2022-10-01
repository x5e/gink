#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
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
    const server = new Expector("make", ["server"]);
    await server.expect("ready", 60000);
    const driver = new Expector("./functional-tests/remote-control.js", []);
    await driver.expect(/gink server/, 2000);
    console.log("success!");

    server.close();
    browser.close();
    driver.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => { console.error(reason); process.exit(1); })
