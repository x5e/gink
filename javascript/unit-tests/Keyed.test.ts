import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("test reset", async function () {
    for (const store of [
        new IndexedDbStore("Keyed.reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const prop = instance.getGlobalProperty();
        const pairMap = await instance.createPairMap();
        const schema = await instance.createDirectory();
        await schema.set("a key", "a value");
        await pairMap.set([prop, schema], "a value");

        const afterFirst = generateTimestamp();

        await prop.set(schema, "named directory");
        await schema.set("another key", "another value");
        await pairMap.set([schema, prop], "reversed");
        ensure((await prop.get(schema)) === "named directory");
        ensure((await schema.get("another key")) === "another value");
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        const afterProp = generateTimestamp();

        // Reset when first entry is still there
        await schema.reset({ toTime: afterFirst });

        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");
        ensure((await prop.get(schema)) === "named directory");
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        // Reset to before first entry
        await schema.reset();

        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === undefined);
        ensure((await prop.get(schema)) === "named directory");
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        await prop.reset({ toTime: afterFirst });
        ensure((await prop.get(schema)) === undefined);
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        await schema.reset({ toTime: afterFirst });
        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");
        ensure((await prop.get(schema)) === undefined);
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        await prop.reset({ toTime: afterProp });
        ensure((await prop.get(schema)) === "named directory");
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");

        await pairMap.reset({ toTime: afterFirst });
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === undefined);

        await pairMap.reset({ toTime: afterProp });
        ensure((await pairMap.get([prop, schema])) === "a value");
        ensure((await pairMap.get([schema, prop])) === "reversed");
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
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure(typeof (await schema.get("child")) === "object");

        await schema.clear();
        ensure((await schema.size()) === 0);

        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure(typeof (await schema.get("child")) === "object");
        // Same reset again, should not change anything
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure(typeof (await schema.get("child")) === "object");

        // Make sure a deletion doesn't cause problems
        await schema.delete("child");
        ensure((await schema.get("child")) === undefined);
        await schema.reset({ toTime: afterInit, recurse: true });
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure(typeof (await schema.get("child")) === "object");

        await store.close();
    }
});
