#!/usr/bin/env ts-node

import { Server, ServerArgs } from "./Server";
import { LogBackedStore } from "./LogBackedStore";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { Client } from "./Client";

console.log("hello world");


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

let clientOrServer: Client;
if (process.env["GINK_PORT"]) {
    clientOrServer = new Server(store, {
        port: process.env["GINK_PORT"],
        sslKeyFilePath: process.env["GINK_SSL_KEY"],
        sslCertFilePath: process.env["GINK_SSL_CERT"],
        staticPath: process.env["GINK_STATIC_PATH"],
    });
} else {
    clientOrServer = new Client(store);
}

const targets = process.argv.slice(2);

(async () => {
    for (var target of targets) {
        await clientOrServer.connectTo(target);
    }
})();

console.log("the end");