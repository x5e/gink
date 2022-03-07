import {LogBackedStore} from "./LogBackedStore";
import { testStore } from "./Store.test";

testStore('LogBackedStore', async () => new LogBackedStore("/tmp/test.commits", true));