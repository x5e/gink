import { RoutingServer } from "./RoutingServer";
import { LogBackedStore } from "./LogBackedStore";
import { Store } from "./Store";
import { Database } from "./Database";
import { AuthFunction, BundleInfo } from "./typedefs";
import { Bundler } from "./Bundler";
import { SimpleServer } from "./SimpleServer";
import { ensure, generateTimestamp, getIdentity, logToStdErr } from "./utils";
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
    instance?: Database;
    routingServer?: RoutingServer;
    replServer?: REPLServer;

    constructor(process: NodeJS.Process) {
        logToStdErr("starting...");

        // This makes debugging through integration tests way easier.
        globalThis.ensure = ensure;

        const dataRoot = process.env["GINK_DATA_ROOT"];
        const dataFile = process.env["GINK_DATA_FILE"];
        const reset = !!process.env["GINK_RESET"];
        const identity = process.env["GINK_IDENTITY"] ?? getIdentity();
        ensure(identity);

        /*
        If an auth key is found in the server's environment variable
        GINK_TOKEN, then all clients will be required to have
        'token {token}' in their websocket subprotocol list.
        Otherwise, just accept all connections with the gink subprotocol.
        */
        let authKey = process.env["GINK_TOKEN"];
        // This is different than GINK_AUTH_TOKEN, which is what
        // the client looks for when connecting via the CLI.run().

        let authFunc: AuthFunction | null = null;
        if (authKey) {
            authFunc = (token: string) => {
                // Expecting token to have already been decoded from hex.
                if (!token) return false;
                // Purposely using includes here since the token will have been
                // decoded and may contain '\x00' as a prefix.
                ensure(token.includes("token "));
                let key = authKey.toLowerCase();
                token = token.toLowerCase().split("token ")[1].trimStart();
                return token == key;
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
                authFunc: authFunc
            };
            if (dataRoot) {
                this.routingServer = new RoutingServer({
                    identity: identity,
                    dataFilesRoot: dataRoot,
                    ...common
                });
            } else {
                this.instance = new SimpleServer(this.store, { identity: identity, ...common });
            }
        } else {
            // GINK_PORT not set, so don't listen for incoming connections
            this.instance = new Database(this.store, identity);
        }
        this.targets = process.argv.slice(2);
    }

    async run() {
        if (this.instance) {
            await this.instance.ready;
            globalThis.database = this.instance;
            globalThis.root = this.instance.getGlobalDirectory();
            this.instance.addListener(
                async (commitInfo: BundleInfo) => logToStdErr(`received commit: ${JSON.stringify(commitInfo)}`));
            for (const target of this.targets) {
                logToStdErr(`connecting to: ${target}`);
                try {
                    await this.instance.connectTo(target, { onClose: logToStdErr, authToken: process.env["GINK_AUTH_TOKEN"] });
                    logToStdErr(`connected!`);
                } catch (e) {
                    logToStdErr(`Failed connection to ${target}. Bad Auth token?\n` + e);
                }
            }
        } else {
            await this.routingServer?.ready;
        }
        this.replServer = start({ prompt: "node+gink> ", useGlobal: true });
    }
}
