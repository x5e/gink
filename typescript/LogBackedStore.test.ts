import { LogBackedStore } from "./LogBackedStore";
import { testStore } from "./Store.test";

testStore('LogBackedStore', async () => new LogBackedStore("/tmp/test.commits", true));

test('test locks', async () => {
    const fn = "/tmp/test.store";
    const lbs1 = new LogBackedStore(fn);
    await lbs1.initialized;
    let result = "undecided";
    const lbs2 = new LogBackedStore(fn);
    await lbs2.initialized.then(() => {result="acquired";}).catch(() => {result="barfed";});
    if (result != "barfed") {
        throw new Error("locking broken");
    }
})