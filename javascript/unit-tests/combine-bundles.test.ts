import { GinkInstance, IndexedDbStore, } from "../implementation";
import { ensure } from "../implementation/utils";

it('bundle.combining', async function () {
    const store = new IndexedDbStore('bundle combining test', true)
    const instance = new GinkInstance(store);
    await instance.ready;
    const schema = await instance.createDirectory();

    // make two changes
    const changesBeforeTwo = store.getTransactionCount();
    await schema.set("key1", "value1");
    await schema.set("key2", "value2");
    const changesAfterTwo = store.getTransactionCount();
    ensure(changesAfterTwo - changesBeforeTwo >= 2, `two:${changesBeforeTwo} => ${changesAfterTwo} `);

    const changeBeforeCombo = store.getTransactionCount();
    const _ = schema.set("first1", "v1");
    const promise2 = schema.set("second2", "v2");
    await promise2;
    const changesAfterCombo = store.getTransactionCount();
    ensure(changesAfterCombo - changeBeforeCombo == 1, `combo ${changeBeforeCombo} => ${changesAfterCombo}`);

});
