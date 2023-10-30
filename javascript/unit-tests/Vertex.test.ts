import { sleep } from "./test_utils";
import { GinkInstance, Bundler, IndexedDbStore, Vertex } from "../implementation";
import { ensure } from "../implementation/utils";


test('isAlive and remove', async function() {
    const store = new IndexedDbStore('vertex1', true);
    const instance = new GinkInstance(store);
    const vertex = await instance.createVertex();
    const aliveTime = instance.getNow();
    ensure(await vertex.isAlive());
    await vertex.remove();
    ensure(!await vertex.isAlive());
    ensure(await vertex.isAlive(aliveTime));
});