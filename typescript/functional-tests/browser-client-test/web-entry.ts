eval("globalThis.test = function() {};");
import { IndexedDbStore } from "../../library-implementation/IndexedDbStore";
import { GinkInstance } from "../../library-implementation/GinkInstance";
import { ChangeSet } from "../../library-implementation/ChangeSet";
import { ChangeSetInfo } from "../../library-implementation/typedefs";

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

async function onCommit(changeSetInfo: ChangeSetInfo) {
    if (document == null) { throw new Error("unexpected"); }
    document.getElementById('messages')!.innerHTML +=
        `${changeSetInfo.medallion}, ${changeSetInfo.timestamp}, ` +
        `"${changeSetInfo.comment}"\n`;
}

(async () => {
    const instance = new GinkInstance(new IndexedDbStore("browser-test", true), {software: "browser instance"});
    await instance.ready;
    instance.addListener(onCommit);
    await instance.addChangeSet(new ChangeSet("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();
