#!/usr/bin/env ts-node

import { Server } from "./Server";
import { LogBackedStore } from "./LogBackedStore";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { Client, Commit } from "./Client";
var readline = require('readline');

console.log("gink starting...");
globalThis.debugging = true;


const logFile = process.env["GINK_LOG_FILE"];
const reset = !!process.env["GINK_RESET"];
let store: Store;
if (logFile) {
    console.log(`using log file=${logFile}, reset=${reset}`);
    store = new LogBackedStore(logFile,);
} else {
    console.log(`using in-memory database`);
    store = new IndexedDbStore();
}

let instance: Client | Server;
if (process.env["GINK_PORT"]) {
    instance = new Server(store, {
        port: process.env["GINK_PORT"],
        sslKeyFilePath: process.env["GINK_SSL_KEY"],
        sslCertFilePath: process.env["GINK_SSL_CERT"],
        staticPath: process.env["GINK_STATIC_PATH"],
    });
} else {
    instance = new Client(store);
}

const targets = process.argv.slice(2);

(async () => {
    await instance.initialized;
    for (let target of targets) {
        console.log(`connecting to: ${target}`)
        await instance.connectTo(target);
        console.log(`connected!`)
    }
    const chainManager = await instance.getChainManager();
    console.log(`got chain manager, using medallion=${chainManager.medallion}`)
    console.log("ready (type a comment and press enter to create a commit)");
    const readlineInterface = readline.createInterface(process.stdin, process.stdout);
    readlineInterface.setPrompt("comment>");
    readlineInterface.prompt();
    readlineInterface.on('line', async (comment: string) => {
        const commit = new Commit(comment);
        await chainManager.addCommit(commit);
        readlineInterface.prompt();
    })
})();