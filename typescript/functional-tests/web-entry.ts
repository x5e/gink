eval("globalThis.test = function() {};");
import { IndexedDbStore } from "../library/IndexedDbStore";

import { CommitInfo } from "../library/typedefs";
import { GinkInstance } from "../library/GinkInstance";
import { ChangeSet } from "../library/ChangeSet";

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
    await instance.addChangeSet(new ChangeSet("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();
