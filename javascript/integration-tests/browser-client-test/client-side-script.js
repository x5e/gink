

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

async function onBundle(changeSetInfo) {
    if (document == null) { throw new Error("unexpected"); }
    document.getElementById('messages').innerHTML +=
        `${changeSetInfo.medallion}, ${changeSetInfo.timestamp}, ` +
        `"${changeSetInfo.comment}"\n`;
}

(async () => {
    const instance = new gink.Database(new gink.IndexedDbStore("browser-test", true));
    await instance.ready;
    instance.addListener(onBundle);
    await instance.addBundler(new gink.Bundler("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();
