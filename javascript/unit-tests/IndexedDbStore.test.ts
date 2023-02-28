import { testStore } from "./Store.test";
import { IndexedDbStore } from "../implementation";

testStore('IndexedDbStore', async () => new IndexedDbStore("test", true));
export const result = 1;
