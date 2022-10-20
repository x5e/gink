import { GinkServer } from "./library-implementation/GinkServer";
import { LogBackedStore } from "./library-implementation/LogBackedStore";
import { IndexedDbStore } from "./library-implementation/IndexedDbStore";
import { Store } from "./library-implementation/Store";
import { GinkInstance } from "./library-implementation/GinkInstance";
import { ChangeSetInfo } from "./library-implementation/typedefs";
import { ChangeSet } from "./library-implementation/ChangeSet";
var readline = require('readline');

/**
* Uses console.error to log messages to stderr in a form like:
* [04:07:03.227Z CommandLineInterace.ts:51] got chain manager, using medallion=383316229311328
* That is to say, it's:
* [<Timestamp> <SourceFileName>:<SourceLine>] <Message>
* @param msg message to log
*/
function logToStdErr(msg: string) {
    const stackString = (new Error()).stack;
    const callerLine = stackString ? stackString.split("\n")[2] : "";
    const caller = callerLine.split(/\//).pop()?.replace(/:\d+\)/, "");
    const timestamp = ((new Date()).toISOString()).split("T").pop();
    // using console.error because I want to write to stderr
    console.error(`[${timestamp} ${caller}] ${msg}`);
}


async function onCommit(commitInfo: ChangeSetInfo) {
    logToStdErr(`received commit: ${JSON.stringify(commitInfo)}`);
}

/**
    Intended to manage server side running of Gink.
    Basically it takes some settings in the form of
    environment variables plus a list of peers to
    connect to then starts up the Gink Instance,
    or Gink Server if port listening is specfied.
    TODO(https://github.com/google/gink/issues/43): implement --help
*/
export class CommandLineInterface {
    targets: string[];
    store: Store;
    instance: GinkInstance;

    constructor(process: NodeJS.Process) {
        logToStdErr("starting...");

        const logFile = process.env["GINK_LOG_FILE"];
        const reset = !!process.env["GINK_RESET"];

        if (logFile) {
            logToStdErr(`using log file=${logFile}, reset=${reset}`);
            this.store = new LogBackedStore(logFile,);
        } else {
            logToStdErr(`using in-memory database`);
            this.store = new IndexedDbStore();
        }

        if (process.env["GINK_PORT"]) {
            this.instance = new GinkServer(this.store, "gink server", {
                port: process.env["GINK_PORT"],
                sslKeyFilePath: process.env["GINK_SSL_KEY"],
                sslCertFilePath: process.env["GINK_SSL_CERT"],
                staticPath: process.env["GINK_STATIC_PATH"] || process.cwd(),
                logger: logToStdErr,
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
            logToStdErr(`connecting to: ${target}`)
            await this.instance.connectTo(target, logToStdErr);
            logToStdErr(`connected!`)
        }
        logToStdErr("ready (type a comment and press enter to create a commit)");
        const readlineInterface = readline.createInterface(process.stdin, process.stdout);
        readlineInterface.on('line', async (comment: string) => {
            await this.instance.addChangeSet(new ChangeSet(comment));
        })
    }

}
