#!/usr/bin/env ts-node
import { CommandLineInterface } from "./library/CommandLineInterace";
import { setLogLevel } from "./library/utils";
setLogLevel(1);
new CommandLineInterface(process).run();
