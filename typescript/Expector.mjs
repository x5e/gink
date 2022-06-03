#!/usr/bin/node 
const { spawn } = require('child_process');
export class Expector {
    constructor(shellCmd) {
        const thisExpector = this;
        this.captured = "";
        this.expecting = null;
        this.proc = spawn(shellCmd, [], {shell: true});
        const appender = this.notify.bind(this);
        this.proc.stdout.on('data', appender);
        this.proc.stderr.on('data', appender);
    }
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
    async expect(what, timeout=1000) {
        this.expecting = what;
        const thisExpector = this;
        const returning = new Promise((resolve, reject) => {
            thisExpector.onHit = resolve;
            setTimeout(reject, timeout);
        });
        this.notify();
        return returning;
    }
}
