#!/usr/bin/env -S node --unhandled-rejections=strict

const Expector = require("./Expector");
(async () => {
    const expector = new Expector("asdfasdfa", []);
    await expector.spawned;
})()
    .catch((err) => {
        console.error(err);
        console.error(`task failed successfully`);
        process.exit(0);
    })
    .then(() => {
        console.error("did not want this to succeed!");
        process.exit(1);
    });
