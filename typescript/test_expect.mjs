#!/usr/bin/node --harmony-to-level-await
import { Expector } from "./Expector";
const expector = new Expector("echo one two three");
await expector.expect("two");
