import { testGinkStore } from "./GinkStore.test";
import { IndexedDbGinkStore } from "./IndexedDbGinkStore";

// Jest complains if there's a test suite without a test.
test('placeholder', () => {
    expect(1 + 2).toBe(3);
});

testGinkStore('IndexedDbGinkStore', async () => new IndexedDbGinkStore("test", true));