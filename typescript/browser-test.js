#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
const browserCommand = [
    "chromium", 
    "--headless",
    "--no-sandbox", 
    "--remote-debugging-port=9222", 
    "--disable-gpu",
].join(" ");
(async () => {
    console.log("starting");
    console.log(browserCommand);
    const browser = new Expector(browserCommand);
    const server = new Expector("make server");
    await server.expect("ready", 60000);
    const driver = new Expector("./typescript/remote-control.js");
    await driver.expect(/Hello from a Gink Server/, 2000);
    console.log("success!");

    server.close();
    browser.close();
    driver.close();
    console.log("ok!");
    process.exit(0);
})().catch((reason) => {console.error(reason); process.exit(1);})
