import { RoutingServer } from "./RoutingServer";
import { LogBackedStore } from "./LogBackedStore";
import { Store } from "./Store";
import { GinkInstance } from "./GinkInstance";
import { AuthFunction, BundleInfo, CallBack } from "./typedefs";
import { Bundler } from "./Bundler";
import { SimpleServer } from "./SimpleServer";
import { ensure, generateTimestamp, logToStdErr } from "./utils";
import { IndexedDbStore } from "./IndexedDbStore";
import { start, REPLServer } from "node:repl";


/**
    Intended to manage server side running of Gink.
    Basically it takes some settings in the form of
    environment variables plus a list of peers to
    connect to then starts up the Gink Instance,
    or Gink Server if port listening is specified.
    TODO(https://github.com/google/gink/issues/43): implement --help
*/
export class CommandLineInterface {
    targets: string[];
    store?: Store;
    instance?: GinkInstance;
    routingServer?: RoutingServer;
    replServer?: REPLServer;

    constructor(process: NodeJS.Process) {
        logToStdErr("starting...");

        const dataRoot = process.env["GINK_DATA_ROOT"];
        const dataFile = process.env["GINK_DATA_FILE"];
        const reset = !!process.env["GINK_RESET"];

        /*
        If an auth key is found in the server's environment variable
        GINK_AUTH_KEY, then all clients will be required to have
        'token {key}' in their websocket subprotocol list.
        Otherwise, just accept all connections with the gink subprotocol.
        */
        const authKey = process.env["GINK_AUTH_KEY"];

        let authFunc: AuthFunction | null = null;
        if (authKey) {
            authFunc = (token: string) => {
                return token == authKey;
            };
        }

        if (dataRoot) {
            logToStdErr(`using data root ${dataRoot}`);
            ensure(process.env["GINK_PORT"]);
        } else if (dataFile) {
            logToStdErr(`using data file=${dataFile}, reset=${reset}`);
            this.store = new LogBackedStore(dataFile, reset);
        } else {
            logToStdErr(`using in-memory database`);
            this.store = new IndexedDbStore(generateTimestamp().toString());
        }

        if (process.env["GINK_PORT"]) {
            const common = {
                port: process.env["GINK_PORT"],
                sslKeyFilePath: process.env["GINK_SSL_KEY"],
                sslCertFilePath: process.env["GINK_SSL_CERT"],
                staticContentRoot: process.env["GINK_STATIC_PATH"],
                logger: logToStdErr,
                authFunc: authFunc,
                useOAuth: false
            };
            if (dataRoot) {
                this.routingServer = new RoutingServer({
                    dataFilesRoot: dataRoot, ...common
                });
            } else {
                this.instance = new SimpleServer(this.store, { software: "SimpleServer", ...common });
            }
        } else {
            // GINK_PORT not set, so don't listen for incoming connections
            this.instance = new GinkInstance(this.store, { software: "node instance" });
        }
        this.targets = process.argv.slice(2);
    }

    static async onCommit(commitInfo: BundleInfo) {
                logToStdErr(`received commit: ${JSON.stringify(commitInfo)}`);
    }

    async run() {
        globalThis.database = this.instance;
        globalThis.root = this.instance.getGlobalDirectory();
        this.replServer = start({prompt: "node+gink> ", useGlobal: true});
        if (this.instance) {
            await this.instance.ready;
            this.instance.addListener(
                async (commitInfo: BundleInfo) => logToStdErr(`received commit: ${JSON.stringify(commitInfo)}`))
            for (const target of this.targets) {
                logToStdErr(`connecting to: ${target}`);
                try {
                    await this.instance.connectTo(target, logToStdErr);
                    logToStdErr(`connected!`);
                } catch (e) {
                    logToStdErr(`**** Failed connection to ${target}. Bad Auth token? ****`);
                }
            }
        } else {
            await this.routingServer?.ready;
        }
    }
}
