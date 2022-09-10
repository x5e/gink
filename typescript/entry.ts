eval("globalThis.test = function() {};");
import { IndexedDbStore } from "./IndexedDbStore";

import { CommitInfo } from "./typedefs";
import { GinkInstance } from "./GinkInstance";
import { PendingCommit } from "./PendingCommit";

function getWebsocketTarget(): string {
    const loc = window.location;
    let target = "";
    if (loc.protocol === "https:") {
        target = "wss:";
    } else {
        target = "ws:";
    }
    target += "//" + loc.host;
    target += loc.pathname + "/";
    return target;
}

async function onCommit(commitInfo: CommitInfo) {
    document.getElementById('messages').innerHTML += 
        `${commitInfo.medallion}, ${commitInfo.timestamp}, ` + 
        `"${commitInfo.comment}"\n`;
}

(async () => {
    const instance = new GinkInstance(new IndexedDbStore(), "browser instance");
    await instance.initialized;
    instance.addListener(onCommit);
    await instance.addCommit(new PendingCommit("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();

