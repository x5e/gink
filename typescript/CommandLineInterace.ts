import { GinkServer } from "./GinkServer";
import { LogBackedStore } from "./LogBackedStore";
import { IndexedDbStore } from "./IndexedDbStore";
import { Store } from "./Store";
import { GinkInstance } from "./GinkInstance";
import { info } from "./utils";
import { CommitInfo } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
var readline = require('readline');

async function onCommit(commitInfo: CommitInfo) {
    info(`received commit: ${JSON.stringify(commitInfo)}`);
}

export class CommandLineInterface {
    targets: string[];
    store: Store;
    instance: GinkInstance;

    constructor(process: NodeJS.Process) {
        info("starting...");

        const logFile = process.env["GINK_LOG_FILE"];
        const reset = !!process.env["GINK_RESET"];

        if (logFile) {
            info(`using log file=${logFile}, reset=${reset}`);
            this.store = new LogBackedStore(logFile,);
        } else {
            info(`using in-memory database`);
            this.store = new IndexedDbStore();
        }

        if (process.env["GINK_PORT"]) {
            this.instance = new GinkServer(this.store, "gink server", {
                port: process.env["GINK_PORT"],
                sslKeyFilePath: process.env["GINK_SSL_KEY"],
                sslCertFilePath: process.env["GINK_SSL_CERT"],
                staticPath: process.env["GINK_STATIC_PATH"],
            });
        } else {
            this.instance = new GinkInstance(this.store, "node instance");
        }
        this.targets = process.argv.slice(2);
    }

    async run() {
        await this.instance.initialized;
        this.instance.addListener(onCommit);
        for (const target of this.targets) {
            info(`connecting to: ${target}`)
            await this.instance.connectTo(target, info);
            info(`connected!`)
        }
        info("ready (type a comment and press enter to create a commit)");
        const readlineInterface = readline.createInterface(process.stdin, process.stdout);
        readlineInterface.on('line', async (comment: string) => {
            await this.instance.addChangeSet(new ChangeSet(comment));
        })
    }

}
