
import { GinkInstance, Bundler, IndexedDbStore, Vertex, Verb } from "../implementation";
import { ensure } from "../implementation/utils";


test('verb.createEdge', async function() {
    const store = new IndexedDbStore('verb.createEdge', true);
    const instance = new GinkInstance(store);
    const vertex1 = await instance.createVertex();
    const vertex2 = await instance.createVertex();
    const verb1 = await instance.createVerb();
    const edge1 = await verb1.createEdge(vertex1, vertex2);
    ensure(edge1.getSourceVertex().equals(vertex1));
    ensure(edge1.getTargetVertex().equals(vertex2));
    ensure(!edge1.getSourceVertex().equals(vertex2));
    ensure(edge1.getEdgeType().equals(verb1));
});