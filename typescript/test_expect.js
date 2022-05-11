#!/usr/bin/node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
const expector = new Expector("echo one two three");
await expector.expect("two");
await expector.expect("four");
})();
