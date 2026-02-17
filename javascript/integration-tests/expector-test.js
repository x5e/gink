#!/usr/bin/env -S node --unhandled-rejections=strict
const Expector = require("./Expector");
(async () => {
    const expector = new Expector("echo one two three", [], { shell: true });
    await expector.expect("two");
    while (true) {
        try {
            await expector.expect("four"); // should throw after timeout
        } catch {
            break;
        }
        throw Error("wtf");
    }
    const catTest = new Expector("cat");
    catTest.send("hello world");
    await catTest.expect("hello");

    // Process-exit test: expect() while process has already exited should reject
    // with "process exited" message, not the timeout message.
    const shortLived = new Expector("echo quick", [], { shell: true });
    await shortLived.expect("quick"); // process exits after this
    try {
        await shortLived.expect("wont-appear", 5000);
        throw new Error("expected expect() to reject when process has exited");
    } catch (e) {
        const msg = typeof e === "string" ? e : e.message;
        if (!msg.includes("process exited") || !msg.includes("before expected string was seen"))
            throw new Error("Expected rejection to mention process exited; got: " + msg);
    }

    console.log("okay");
    process.exit(0);
})();
