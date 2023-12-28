#!/usr/bin/node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    const expector = new Expector("echo one two three", [], { shell: true });
    await expector.expect("two");
    while (true) {
        try {
            await expector.expect("four", 100); // should throw after timeout
        } catch {
            break;
        }
        throw Error("wtf");
    }
    const catTest = new Expector("cat");
    catTest.send("hello world");
    await catTest.expect("hello");
    console.log("okay");
    process.exit(0);
})();
