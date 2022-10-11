#!/usr/bin/env -S node
require('chromedriver');
const { Builder, Browser, By, Key, until } = require('selenium-webdriver');
(async function () {
  const driver = await new Builder().forBrowser('chrome').build();
  await driver.manage().setTimeouts({ implicit: 3000 });
  try {
    await driver.get('http://127.0.0.1:8080/');
    const webElement = await driver.findElement(By.id('messages'));
    await driver.wait(until.elementTextContains(webElement, "Server"), 3000);
    console.log("found!");
    process.exit(0);
  } catch (error) {
    console.error(`error: ${error}`);
    process.exit(1);
  } finally {
    // await driver.quit();
  }
})();
