import { testStore } from "./Store.test";
import { IndexedDbStore } from "../typescript-impl";

testStore('IndexedDbStore', async () => new IndexedDbStore("test", true));
export const result = 1;