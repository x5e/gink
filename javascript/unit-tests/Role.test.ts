import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, Role } from "../implementation";
import { ensure } from "../implementation/utils";

test('include and exclude work as intended', async function() {
    const store = new IndexedDbStore('test1', true);
    const instance = new GinkInstance(store);
    const role1 = await instance.createRole();

    ensure(await role1.size() == 0, `${await role1.size()}`)

    const box1 = await instance.createBox();
    await role1.include(box1)
    ensure(await role1.size() == 1, `Include test, unexpected size: ${await role1.size()}`)

    await role1.exclude(box1)
    ensure(await role1.size() == 0, `Exclude test, unexpected size: ${await role1.size()}`)
});
