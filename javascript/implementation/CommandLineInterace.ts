import { RoutingServer } from "./RoutingServer";
import { LogBackedStore } from "./LogBackedStore";
import { Store } from "./Store";
import { GinkInstance } from "./GinkInstance";
import { AuthFunction, BundleInfo } from "./typedefs";
import { SimpleServer } from "./SimpleServer";
import { ensure, generateTimestamp, getOAuthClient, logToStdErr, parseOAuthCreds } from "./utils";
import { IndexedDbStore } from "./IndexedDbStore";
import { start, REPLServer } from "node:repl";
import { OAuth2Client, } from 'google-auth-library';


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
        GINK_TOKEN, then all clients will be required to have
        'token {token}' in their websocket subprotocol list.
        Otherwise, just accept all connections with the gink subprotocol.
        */
        const authKey = process.env["GINK_TOKEN"];
        // This is different than GINK_AUTH_TOKEN, which is what
        // the client looks for when connecting via the CLI.run().
        const oAuthCreds = process.env["OAUTH_CREDS"];

        let authFunc: AuthFunction | null = null;
        let oAuth2Client: OAuth2Client = null;
        if (oAuthCreds && authKey) {
            throw new Error("You may only use token auth or OAuth, not both. Please either `unset OAUTH_CREDS` or `unset GINK_TOKEN`");
        }
        if (authKey) {
            authFunc = (token: string) => {
                // Expecting token to have already been decoded from hex.
                if (!token) return Promise.resolve(false);
                ensure(token.startsWith("token "));
                let key = authKey.toLowerCase();
                token = token.toLowerCase().split("token ")[1].trimStart();
                return Promise.resolve(token == key);
            };
        }
        else if (oAuthCreds) {
            const oAuthCredentials = parseOAuthCreds();
            // Set up Google OAuth client
            const oAuth2Client = getOAuthClient();
            authFunc = async (code: string): Promise<boolean> => {
                if (!code) return false;
                const { tokens } = await oAuth2Client.getToken(decodeURIComponent(code));
                const userInfo = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
                if (!oAuthCredentials.authorized_emails.includes(userInfo.email)) {
                    return false;
                }
                oAuth2Client.setCredentials(tokens);
                return true;
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
                oAuth2Client: oAuth2Client
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
