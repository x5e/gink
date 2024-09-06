import {
    Database,
    IndexedDbStore,
    MemoryStore,
    Directory,
} from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("test reset", async function () {
    for (const store of [
        new IndexedDbStore("Keyed.reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const box = await instance.createBox();
        const pairMap = await instance.createPairMap();
        const schema = await instance.createDirectory();
        await schema.set("a key", "a value");
        await pairMap.set([box, schema], "a value");

        const afterFirst = generateTimestamp();

        await schema.set("another key", "another value");
        await pairMap.set([schema, box], "reversed");
        ensure((await schema.get("another key")) === "another value");
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");

        const afterbox = generateTimestamp();

        // Reset when first entry is still there
        await schema.reset({ toTime: afterFirst });

        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");

        // Reset to epoch
        await schema.reset();

        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === undefined);
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");

        await schema.reset({ toTime: afterFirst });
        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");

        await pairMap.reset({ toTime: afterFirst });
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === undefined);

        await pairMap.reset({ toTime: afterbox });
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");
        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");

        // Test recursive reset
        const child = await instance.createDirectory();
        const childOfChild = await instance.createDirectory();
        await child.set("childOfChild", childOfChild);
        await child.set("random key", "random");
        await childOfChild.set("key", "value");
        await schema.set("child", child);

        const afterInit = generateTimestamp();

        await childOfChild.set("key", "changed");
        await child.set("random key", "changed");
        const afterChanged = generateTimestamp();
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        await schema.clear();
        ensure((await schema.size()) === 0);
        // Reset after a clear
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Same reset again, should not change anything
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Make sure a deletion doesn't cause problems
        await schema.delete("child");
        ensure((await schema.get("child")) === undefined);
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Recurse = false should not reset children
        await schema.reset({ toTime: afterChanged });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        await store.close();
    }
});
