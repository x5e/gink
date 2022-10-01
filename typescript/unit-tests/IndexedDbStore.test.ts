import { testStore } from "./Store.test";
import { IndexedDbStore } from "../library-code/IndexedDbStore";

testStore('IndexedDbStore', async () => new IndexedDbStore("test", true));
export const result = 1;