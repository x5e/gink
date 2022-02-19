import {testAcceptsChainStartOnce} from "./GinkStore.test";
import {IndexedDbGinkStore} from "./IndexedDbGinkStore";

test("IndexedGink testAcceptsChainStartOnce", 
    async () => {await testAcceptsChainStartOnce(new IndexedDbGinkStore())});