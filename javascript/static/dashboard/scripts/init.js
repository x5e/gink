document.addEventListener('DOMContentLoaded', async () => {
    // Initialize and connect database store and instance
    const store = new gink.IndexedDbStore();
    const instance = new gink.GinkInstance(store);
    await instance.ready;

    // Connect to server
    await instance.connectTo(`ws://${window.location.host}`);
    // Initialize interface for interacting with database
    const database = new Database(store, instance);

    // Initialize and display page
    const page = new Page(database);
    await page.displayPage(...page.unwrapHash(window.location.hash));

    const refreshContainer = async () => {
        if (page.pageType == "container") {
            await page.displayPage(...page.unwrapHash(window.location.hash));
        }
    };
    // Add a listener to refresh when a new commit comes through
    // Eventually make sure this is only for specific containers.
    database.instance.addListener(refreshContainer);

    window.onhashchange = async () => {
        await page.displayPage(...page.unwrapHash(window.location.hash));
    };
});

/**
 * Easy way to populate database for testing.
 * @param {gink.GinkInstance} instance
 */
async function test(instance) {
    const globalDir = instance.getGlobalDirectory();
    const box = await instance.createBox();
    await globalDir.set("box", box);
    aJSArray = [1, 5, 6, 14, 14, 41, "hmmmm", "buncha data"];
    await box.set(aJSArray);

    const role = await instance.createRole();
    await globalDir.set("role", role);

    const pm = await instance.createPairMap();
    await globalDir.set("pm", pm);
    await pm.set([box, role], "box-role");

    const ps = await instance.createPairSet();
    await globalDir.set("ps", ps);
    await ps.include([box, role]);

    const ks = await instance.createKeySet();
    await globalDir.set("ks", ks);
    await ks.add("test data keyset entry");

    const seq = await instance.createSequence();
    await globalDir.set("seq", seq);
    for (let i = 0; i < 50; i++) {
        await seq.push(`test${i}`);
    }

    await role.include(pm);
    await role.include(box);
    await role.include(ks);
}
