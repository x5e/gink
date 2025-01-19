#!/usr/bin/env node
// note, you need to run tsc and run the output
export * from "./index";
export { LogBackedStore } from "./LogBackedStore";
export { SimpleServer } from "./SimpleServer";
import { CommandLineInterface } from "./CommandLineInterface";
export { CommandLineInterface };
import { ArgumentParser } from "argparse";

// Run the CLI if run as a script.
if (require.main === module) {
    const parser = new ArgumentParser();
    parser.add_argument("-c", "--connect-to", {
        help: `gink databases to connect to (e.g wss://localhost:8080)`,
        nargs: "*",
    });
    parser.add_argument("-l", "--listen-on", {
        help: `port to listen on (default 8080). if flag is not included, gink does not listen for incoming connections.`,
        default: process.env["GINK_PORT"],
        nargs: "?",
        const: 8080,
    });
    parser.add_argument("data_file", {
        nargs: "?",
        help: `path to a log-backed database file.`,
        default: process.env["GINK_DATA_FILE"],
    });
    parser.add_argument("-i", "--identity", {
        help: `explicitly set your identity. default is user@hostname.`,
    });
    parser.add_argument("--static-path", {
        help: `the path to serve static files from. if you change this, you won't be able to access the gink dashboard.`,
        default: process.env["GINK_STATIC_PATH"],
    });
    parser.add_argument("--auth-token", {
        help: `if gink is listening for connections, this is the token required for clients to connect.
        if gink is connecting to other databases, this token will be passed.`,
        default: process.env["GINK_AUTH_TOKEN"],
    });
    parser.add_argument("--ssl-cert", {
        help: `path to an ssl certificate. if this and --ssl-key are provided and valid, gink will listen using wss:// for secure connections.`,
        default: process.env["GINK_SSL_CERT"],
    });
    parser.add_argument("--ssl-key", {
        help: `path to an ssl key. if this and --ssl-cert are provided and valid, gink will listen using wss:// for secure connections.`,
        default: process.env["GINK_SSL_KEY"],
    });
    parser.add_argument("-v", "--verbose", {
        help: `whether or not to be verbose`,
        action: "store_true",
    });
    parser.add_argument("--exclusive", {
        help: `prevent other programs from accessing this file (faster)`,
        action: "store_true",
    });
    parser.add_argument("-r", "--reconnect", {
        help: `retry connection to database servers if they disconnect? default is true.`,
        nargs: "?",
        const: true,
    });

    const args = parser.parse_args();

    new CommandLineInterface(args).run();
}

process.on("unhandledRejection", (reason: string, promise) => {
    if (reason) throw new Error(reason);
    else
        console.log(
            "Unhandled Promise Rejection: Likely due to closed websocket connection.",
        );
});
