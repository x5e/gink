#!/usr/bin/env node

process.on('unhandledRejection', (error) => {
    // Handle the unhandled promise rejection here
    console.error('Unhandled promise rejection:', error);
  });
// note, you need to run tsc and run the output
export * from "./index";
export { LogBackedStore } from "./LogBackedStore";
export { SimpleServer } from "./SimpleServer";
export { RoutingServer } from "./RoutingServer";
import { CommandLineInterface } from "./CommandLineInterace";
export { CommandLineInterface }

// Run the CLI if run as a script.
if (require.main === module) {
    new CommandLineInterface(process).run();
}
