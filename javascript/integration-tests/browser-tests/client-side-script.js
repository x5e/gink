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

async function onBundle(changeSet) {
    if (document === null) {
        throw new Error("unexpected");
    }
    document.getElementById("messages").innerHTML +=
        `${changeSet.info.medallion}, ${changeSet.info.timestamp}, ` +
        `"${changeSet.info.comment}"\n`;
}

(async () => {
    const instance = new gink.Database(
        new gink.IndexedDbStore("browser-test", true),
    );
    await instance.ready;
    instance.addListener(onBundle);
    await instance.addBundler(new gink.Bundler("Hello, Universe!"));
    await instance.connectTo(getWebsocketTarget());
})();
