#!/usr/bin/env ts-node
import { CommandLineInterface } from "./library-code/CommandLineInterace";
import { setLogLevel } from "./library-code/utils";
setLogLevel(1);
new CommandLineInterface(process).run();
