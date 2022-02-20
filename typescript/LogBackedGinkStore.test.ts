import {LogBackedGinkStore} from "./LogBackedGinkStore";
import { testGinkStore } from "./GinkStore.test";

testGinkStore('LogBackedGinkStore', async () => new LogBackedGinkStore("/tmp/test.commits", true, "test"));