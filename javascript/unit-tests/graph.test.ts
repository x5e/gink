
import { Database, IndexedDbStore, Vertex, EdgeType, MemoryStore } from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it('isAlive and remove', async function () {
    for (const store of [
        new IndexedDbStore('graph.test1', true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex = await instance.createVertex();
        const aliveTime = generateTimestamp();
        ensure(await vertex.isAlive());
        await vertex.remove();
        const deadTime = generateTimestamp();
        ensure(!await vertex.isAlive());
        ensure(await vertex.isAlive(aliveTime));
        await vertex.revive();
        ensure(await vertex.isAlive());
        ensure(!await vertex.isAlive(deadTime));
    }
});

it('verb.createEdge', async function () {
    for (const store of [new IndexedDbStore('verb.createEdge', true), new MemoryStore(true)]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex1 = await instance.createVertex();
        const vertex2 = await instance.createVertex();
        const verb1 = await instance.createEdgeType();
        const edge1 = await verb1.createEdge(vertex1, vertex2);
        ensure((edge1.getSourceVertex()).equals(vertex1));
        ensure((edge1.getTargetVertex()).equals(vertex2));
        ensure(!(edge1.getSourceVertex()).equals(vertex2));
        ensure((edge1.getEdgeType()).equals(verb1));
    }
});

it('from_to', async function () {
    for (const store of [
        new MemoryStore(true),
        new IndexedDbStore('from_to', true),
    ]) {
    const instance = new Database(store);
    await instance.ready;
    const vertex1 = await instance.createVertex();
    const vertex2 = await instance.createVertex();
    const vertex3 = await instance.createVertex();
    const verb = await instance.createEdgeType();
    const edge12 = await verb.createEdge(vertex1, vertex2);
    const edge13 = await verb.createEdge(vertex1, vertex3);
    const edge11 = await verb.createEdge(vertex1, vertex1);
    const edge21 = await verb.createEdge(vertex2, vertex1);
    const edge22 = await verb.createEdge(vertex2, vertex2);
    const edge23 = await verb.createEdge(vertex2, vertex3);

    /*
    const entries = await store.getAllEntries();
    for (let i = 0; i< entries.length; i++) {
        console.log(JSON.stringify(entries[i]));
    }
     */
    const edgesTo2 = await vertex2.getEdgesTo();
    ensure(edgesTo2.length == 2, `wtf: ${edgesTo2.length}`);
    ensure(edgesTo2[0].equals(edge12) || edgesTo2[0].equals(edge22));
    ensure(edgesTo2[1].equals(edge12) || edgesTo2[1].equals(edge22));
    ensure(!edgesTo2[0].equals(edgesTo2[1]));

    const edgesFrom2 = await vertex2.getEdgesFrom();
    ensure(edgesFrom2.length == 3);
    ensure(edgesFrom2[0].equals(edge21));
    ensure(edgesFrom2[1].equals(edge22));
    ensure(edgesFrom2[2].equals(edge23));

    await edge11.remove();
    const edgesFrom1 = await vertex1.getEdgesFrom();
    ensure(edgesFrom1.length == 2);
    ensure(edgesFrom1[0].equals(edge12));
    ensure(edgesFrom1[1].equals(edge13));
}
});

it('edge_reorder', async function () {
    for (const store of [
        new MemoryStore(true),
        // new IndexedDbStore('edge_reorder', true), TODO: fix bySource and byTarget indexes
    ]) {
        const instance = new Database(store);
        await instance.ready;

        const a = await instance.createVertex();
        const b = await instance.createVertex();

        const p = await instance.createEdgeType();

        const beforeX = generateTimestamp();
        const x = await p.createEdge(a, b);
        const y = await p.createEdge(a, b);

        const edges1 = await a.getEdgesFrom();
        ensure(edges1.length == 2 && edges1[0].equals(x) && edges1[1].equals(y), edges1.toString());

        await y.remove(beforeX);

        const edges2 = await a.getEdgesFrom();
        ensure(edges2.length == 2 && edges2[0].equals(y) && edges2[1].equals(x), edges2.toString());
    }
});
