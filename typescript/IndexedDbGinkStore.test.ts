import { testGinkStore } from "./GinkStore.test";
import { IndexedDbGinkStore } from "./IndexedDbGinkStore";

testGinkStore('IndexedDbGinkStore', async () => new IndexedDbGinkStore("test", true));