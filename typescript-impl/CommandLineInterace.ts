import { RoutingServer } from "./RoutingServer";
import { LogBackedStore } from "./LogBackedStore";
import { Store } from "./Store";
import { GinkInstance } from "./GinkInstance";
import { ChangeSetInfo } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
var readline = require('readline');
import { SimpleServer } from "./SimpleServer";
import { ensure, logToStdErr } from "./utils";
import { IndexedDbStore } from "./IndexedDbStore";


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
    store?: Store;
    instance?: GinkInstance;
    routingServer?: RoutingServer;

    constructor(process: NodeJS.Process) {
        logToStdErr("starting...");

        const dataRoot = process.env["GINK_DATA_ROOT"];
        const dataFile = process.env["GINK_DATA_FILE"];
        const reset = !!process.env["GINK_RESET"];


        if (dataRoot) {
            logToStdErr(`using data root ${dataRoot}`);
            ensure(process.env["GINK_PORT"]);
        } else if (dataFile) {
            logToStdErr(`using data file=${dataFile}, reset=${reset}`);
            this.store = new LogBackedStore(dataFile, reset);
        } else {
            logToStdErr(`using in-memory database`);
            this.store = new IndexedDbStore();
        }

        if (process.env["GINK_PORT"]) {
            const common = {
                port: process.env["GINK_PORT"],
                sslKeyFilePath: process.env["GINK_SSL_KEY"],
                sslCertFilePath: process.env["GINK_SSL_CERT"],
                staticContentRoot: process.env["GINK_STATIC_PATH"],
                logger: logToStdErr,
            }
            if (dataRoot) {
                this.routingServer = new RoutingServer({
                    dataFilesRoot: dataRoot, ...common
                });
            } else {
                this.instance = new SimpleServer(this.store!, { software: "SimpleServer", ...common });
            }
        } else {
            // GINK_PfORT not set, so don't listen for incoming connections
            this.instance = new GinkInstance(this.store!, { software: "node instance" });
        }
        this.targets = process.argv.slice(2);
    }

    static async onCommit(commitInfo: ChangeSetInfo) {
        logToStdErr(`received commit: ${JSON.stringify(commitInfo)}`);
    }

    async run() {
        if (this.instance) {
            await this.instance.ready;
            const instance = this.instance;
            this.instance.addListener(CommandLineInterface.onCommit);
            for (const target of this.targets) {
                logToStdErr(`connecting to: ${target}`)
                await this.instance.connectTo(target, logToStdErr);
                logToStdErr(`connected!`)
            }
            logToStdErr("ready (type a comment and press enter to create a commit)");
            const readlineInterface = readline.createInterface(process.stdin, process.stdout);
            readlineInterface.on('line', async (comment: string) => {
                instance.addChangeSet(new ChangeSet(comment));
            })
        } else {
            await this.routingServer?.ready;
            logToStdErr("routing server ready");
        }
    }
}
