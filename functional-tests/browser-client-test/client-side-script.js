

function getWebsocketTarget() {
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

async function onCommit(changeSetInfo) {
    if (document == null) { throw new Error("unexpected"); }
    document.getElementById('messages').innerHTML +=
        `${changeSetInfo.medallion}, ${changeSetInfo.timestamp}, ` +
        `"${changeSetInfo.comment}"\n`;
}

(async () => {
    const instance = new gink.GinkInstance(new gink.IndexedDbStore("browser-test", true), {software: "browser instance"});
    await instance.ready;
    instance.addListener(onCommit);
    await instance.addChangeSet(new gink.ChangeSet("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();
