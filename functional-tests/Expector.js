#!/usr/bin/node
const { spawn } = require('child_process');
/**
Expector is a utility class to replecate the functionality found in the command line 
utility "expect" and allow me to test the command line interface in integration tests.
*/
module.exports = class Expector {

    /**
    * Takes a shellCommand as a string, starts it and then allows the user to send
    * data and wait for things to happen.
    */
    constructor(program, args, options) {
        this.captured = "";
        this.expecting = null;
        this.proc = spawn(program, args, options);
        const appender = this.notify.bind(this);
        this.proc.stdout.on('data', appender);
        this.proc.stderr.on('data', appender);
    }

    /**
    * This should be private but it's intentionally written in 
      Javascript instead of Typescript, and we don't allow # in
      Typescript code nor the "private" keyword in Javascript so
      just pretend that the "notify" method isn't there :-)

      Internally it's called when new data comes from the underlying
      program and we need to check if the thing we're expecting has arrived.
    */
    notify(fragment) {
        if (fragment) this.captured += fragment;
        if (!this.expecting) return;
        const match = this.captured.match(this.expecting);
        if (match) {
            this.captured = "";
            this.expecting = null;
            this.onHit(match);
        }
    }

    /**
    * Wait for the "what" string to appear in the stdout or stderr of the program,        
    * but reject the promise if timeout happens before the expected string appears.
    */
    async expect(what, timeout = 1000) {
        this.expecting = what;
        const thisExpector = this;
        const returning = new Promise((resolve, reject) => {
            thisExpector.onHit = resolve;
            setTimeout(() => { reject(`expected ${what}, had ${thisExpector.captured}`) }, timeout);
        });
        this.notify();
        return returning;
    }

    /**
    * Sends a string to the controlled program.
    */
    send(what) { this.proc.stdin.write(what); }

    /**
    * Kill the underlying program, and resolve once the program has closed.
    * Note that the constructor starts a shell command, so this program will
    * kill that shell, and will leave programs started by that shell alive.
    * TODO(https://github.com/google/gink/issues/30): kill decendants
    */
    async close(timeout = 1000) {
        const thisExpector = this;
        const returning = new Promise((resolve, reject) => {
            thisExpector.proc.on('close', resolve);
            setTimeout(reject, timeout);
        });
        this.proc.kill();
        return returning;
    }
}
