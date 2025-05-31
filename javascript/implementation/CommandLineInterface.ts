import { LogBackedStore } from "./LogBackedStore";
import { Store } from "./Store";
import { Database } from "./Database";
import { AuthFunction } from "./typedefs";
import { SimpleServer } from "./SimpleServer";
import {
    ensure,
    generateTimestamp,
    getIdentity,
    logToStdErr,
    noOp,
    isAlive,
} from "./utils";
import { IndexedDbStore } from "./IndexedDbStore";
import { start, REPLServer } from "node:repl";
import { Directory } from "./Directory";
import { Box } from "./Box";
import { Sequence } from "./Sequence";
import { KeySet } from "./KeySet";
import { Accumulator } from "./Accumulator";

/**
    Intended to manage server side running of Gink.
    Basically it takes some settings in the form of
    arguments plus a list of peers to
    connect to then starts up the Gink Instance,
    or Gink Server if port listening is specified.
*/
export class CommandLineInterface {
    targets: string[];
    store?: Store;
    instance?: Database;
    replServer?: REPLServer;
    authToken?: string;
    reconnectOnClose: boolean;
    logger: (_: string) => void;

    constructor(args: {
        connect_to?: string[];
        listen_on?: string;
        data_file?: string;
        identity?: string;
        reconnect?: boolean;
        static_path?: string;
        auth_token?: string;
        ssl_cert?: string;
        ssl_key?: string;
        verbose?: boolean;
        exclusive?: boolean;
    }) {
        // This makes debugging through integration tests way easier.
        globalThis.ensure = ensure;
        this.logger = args.verbose ? logToStdErr : noOp;

        this.authToken = args.auth_token;
        this.reconnectOnClose = args.reconnect;
        this.targets = args.connect_to ?? [];
        const identity = args.identity ?? getIdentity();
        ensure(identity);

        let authFunc: AuthFunction | null = null;
        if (this.authToken) {
            authFunc = (token: string) => {
                // Expecting token to have already been decoded from hex.
                if (!token) return false;
                // Purposely using includes here since the token will have been
                // decoded and may contain '\x00' as a prefix.
                ensure(token.includes("token "));
                let key = this.authToken.toLowerCase();
                token = token.toLowerCase().split("token ")[1].trimStart();
                return token === key;
            };
        }

        if (args.data_file) {
            const is_exclusive = args.exclusive ? "exclusive" : "not exclusive";
            this.logger(`using data file=${args.data_file} (${is_exclusive})`);
            this.store = new LogBackedStore(args.data_file, args.exclusive);
        } else {
            this.logger(`using in-memory database`);
            this.store = new IndexedDbStore(generateTimestamp().toString());
        }

        if (args.listen_on) {
            const common = {
                port: args.listen_on,
                sslKeyFilePath: args.ssl_key,
                sslCertFilePath: args.ssl_cert,
                staticContentRoot: args.static_path,
                logger: this.logger,
                authFunc: authFunc,
            };
            this.instance = new SimpleServer({
                store: this.store,
                identity: identity,
                ...common,
            });
        } else {
            // port not set so don't listen for incoming connections
            this.instance = new Database({
                store: this.store,
                identity,
                logger: this.logger,
            });
        }
    }

    async run() {
        if (this.instance) {
            await this.instance.ready;
            globalThis.isAlive = isAlive;
            globalThis.database = this.instance;
            globalThis.root = Directory.get(this.instance);
            globalThis.Accumulator = Accumulator;
            globalThis.Sequence = Sequence;
            globalThis.Box = Box;
            globalThis.KeySet = KeySet;
            globalThis.Directory = Directory;
            for (const target of this.targets) {
                this.logger(`connecting to: ${target}`);
                try {
                    await this.instance.getOrCreateConnection({
                        endpoint: target,
                        reconnectOnClose: this.reconnectOnClose,
                        authToken: this.authToken,
                    });
                    this.logger(`connected!`);
                } catch (e) {
                    this.logger(
                        `Failed connection to ${target}. Bad Auth token?\n` + e,
                    );
                }
            }
        }
        this.replServer = start({ prompt: "node+gink> ", useGlobal: true });
        this.replServer.on("exit", () => {
            process.exit(0);
        });
    }
}
