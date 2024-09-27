const { existsSync } = require("fs");
const { BundleBuilder } = require("../tsc.out/implementation/builders.js");
const { Decomposition } = require("../tsc.out/implementation/Decomposition.js");
const {
    createKeyPair,
    signBundle,
    librariesReady,
    ensure,
} = require("../tsc.out/implementation/utils.js");

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

async function makeChainStart(comment, medallion, chainStart) {
    const bundleBuilder = new BundleBuilder();
    bundleBuilder.setChainStart(chainStart);
    bundleBuilder.setTimestamp(chainStart);
    bundleBuilder.setMedallion(medallion);
    bundleBuilder.setComment(comment);
    bundleBuilder.setIdentity("test-chain-start");
    bundleBuilder.setVerifyKey((await keyPair).publicKey);
    return new Decomposition(
        signBundle(bundleBuilder.serializeBinary(), (await keyPair).secretKey)
    );
}

function extendChainWithoutSign(comment, previous, timestamp) {
    const bundleBuilder = new BundleBuilder();
    const parsedPrevious = previous.builder;
    bundleBuilder.setMedallion(parsedPrevious.getMedallion());
    bundleBuilder.setPrevious(parsedPrevious.getTimestamp());
    bundleBuilder.setChainStart(parsedPrevious.getChainStart());
    bundleBuilder.setTimestamp(timestamp); // one millisecond later
    bundleBuilder.setComment(comment);
    const priorHash = previous.info.hashCode;
    ensure(priorHash && priorHash.length === 32);
    bundleBuilder.setPriorHash(priorHash);
    return bundleBuilder;
}

const keyPair = librariesReady.then(() => createKeyPair());

module.exports = {
    getLaunchOptions: getLaunchOptions,
    sleep: sleep,
    makeChainStart: makeChainStart,
    extendChainWithoutSign: extendChainWithoutSign,
    keyPair: keyPair,
};
