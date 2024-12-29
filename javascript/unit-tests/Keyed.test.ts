import { isEqual } from "lodash";
import {
    Database,
    IndexedDbStore,
    MemoryStore,
    Directory,
    Box,
    PairMap,
} from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("test reset", async function () {
    for (const store of [
        new IndexedDbStore("Keyed.reset", true),
        new MemoryStore(true),
    ]) {
        const database = new Database({ store });
        await database.ready;
        const box = await Box.create(database);
        const pairMap = await PairMap.create(database);
        const schema = await Directory.create(database);
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
        await schema.reset(afterFirst);

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

        await schema.reset(afterFirst);
        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");

        await pairMap.reset(afterFirst);
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === undefined);

        await pairMap.reset(afterbox);
        ensure((await pairMap.get([box, schema])) === "a value");
        ensure((await pairMap.get([schema, box])) === "reversed");
        ensure((await schema.get("another key")) === undefined);
        ensure((await schema.get("a key")) === "a value");

        // Test recursive reset
        const child = await Directory.create(database);
        const childOfChild = await Directory.create(database);
        await child.set("childOfChild", childOfChild);
        await child.set("random key", "random");
        await childOfChild.set("key", "value");
        await schema.set("child", child);

        const afterInit = generateTimestamp();

        await childOfChild.set("key", "changed");
        await child.set("random key", "changed");
        const afterChanged = generateTimestamp();
        await schema.reset(afterInit, true);
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        await schema.clear();
        ensure((await schema.size()) === 0);
        // Reset after a clear
        await schema.reset(afterInit, true);
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Same reset again, should not change anything
        await schema.reset(afterInit, true);
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Make sure a deletion doesn't cause problems
        await schema.delete("child");
        ensure((await schema.get("child")) === undefined);
        await schema.reset(afterInit, true);
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Recurse = false should not reset children
        await schema.reset(afterChanged);
        ensure((await childOfChild.get("key")) === "value");
        ensure((await child.get("random key")) === "random");
        ensure((await schema.get("child")) instanceof Directory);

        // Test circular references doesn't cause infinite loops
        await box.set(schema);
        await schema.set("circle", box);
        const resetTo = generateTimestamp();
        await schema.set("circle", "not a box");
        await schema.reset(resetTo, true);
        ensure((await schema.get("circle")) instanceof Box);
        ensure((await box.get()) instanceof Directory);

        // Test non-immediate reset
        const arr = [1, 2, 3];
        await schema.set("hmm", 2);
        await schema.set(2, arr);
        const afterNumbers = generateTimestamp();
        await schema.set("hmm", 20);
        const bundler = await database.startBundle();

        await schema.reset(afterNumbers, false, { bundler });
        ensure((await schema.get("hmm")) === 20);
        ensure(isEqual(await schema.get(2), arr));
        await bundler.commit();
        ensure((await schema.get("hmm")) === 2, await schema.toJson());
        ensure(isEqual(await schema.get(2), arr));

        await store.close();
    }
});
