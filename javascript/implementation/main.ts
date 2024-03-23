#!/usr/bin/env node
// note, you need to run tsc and run the output
export * from "./index";
export { LogBackedStore } from "./LogBackedStore";
export { SimpleServer } from "./SimpleServer";
export { RoutingServer } from "./RoutingServer";
import { CommandLineInterface } from "./CommandLineInterface";
export { CommandLineInterface };

// Run the CLI if run as a script.
if (require.main === module) {
    new CommandLineInterface(process).run();
}
