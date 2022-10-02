import { GinkServer } from "./library-implementation/GinkServer";
import { LogBackedStore } from "./library-implementation/LogBackedStore";
import { IndexedDbStore } from "./library-implementation/IndexedDbStore";
import { Store } from "./library-implementation/Store";
import { GinkInstance } from "./library-implementation/GinkInstance";
import { info } from "./library-implementation/utils";
import { ChangeSetInfo } from "./api";
import { ChangeSet } from "./library-implementation/ChangeSet";
var readline = require('readline');

async function onCommit(commitInfo: ChangeSetInfo) {
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
                staticPath: process.env["GINK_STATIC_PATH"] || process.cwd(),
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
