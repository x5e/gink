
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

(async () => {
    const instance = new gink.Database(new gink.IndexedDbStore("browser-test", true),
        { software: "browser instance" });
    await instance.ready;
    globalThis.root = instance.getGlobalDirectory();
    instance.addListener(
        async function (changeSetInfo) {
            console.log(changeSetInfo);
            if (document === null) { throw new Error("unexpected"); }
            document.getElementById('dump').innerHTML = await globalThis.root.toJson();
        }
    );
    await instance.connectTo("ws://127.0.0.1:8081/");
})();
