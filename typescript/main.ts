#!/usr/bin/env ts-node
import { CommandLineInterface } from "./CommandLineInterace";
import { setLogLevel } from "./library-implementation/utils";
setLogLevel(1);
new CommandLineInterface(process).run();
