import { Database, IndexedDbStore, Directory } from "../implementation";
import { ensure } from "../implementation/utils";

it("bundle.combining", async function () {
    const store = new IndexedDbStore("bundle combining test", true);
    const instance = new Database({store});
    await instance.ready;
    const schema = Directory.get();


    // make two changes
    const changesBeforeTwo = store.getTransactionCount();
    await schema.set("key1", "value1");
    await schema.set("key2", "value2");
    const changesAfterTwo = store.getTransactionCount();
    ensure(
        changesAfterTwo - changesBeforeTwo >= 2,
        `two:${changesBeforeTwo} => ${changesAfterTwo} `
    );


    const changeBeforeCombo = store.getTransactionCount();
    const _ = schema.set("first1", "v1", {comment: "first comment"});
    const promise2 = schema.set("second2", "v2", {comment: "second comment"});
    await promise2;
    const changesAfterCombo = store.getTransactionCount();
    ensure(
        changesAfterCombo - changeBeforeCombo === 1,
        `combo ${changeBeforeCombo} => ${changesAfterCombo}`
    );
});
