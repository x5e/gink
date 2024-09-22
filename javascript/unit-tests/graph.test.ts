import { Database, IndexedDbStore, MemoryStore } from "../implementation";
import { ensure, generateTimestamp } from "../implementation/utils";

it("isAlive and remove", async function () {
    for (const store of [
        new IndexedDbStore("graph.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex = await instance.createVertex();
        const aliveTime = generateTimestamp();
        ensure(await vertex.isAlive());
        await vertex.remove();
        const deadTime = generateTimestamp();
        ensure(!(await vertex.isAlive()));
        ensure(await vertex.isAlive(aliveTime));
        await vertex.revive();
        ensure(await vertex.isAlive());
        ensure(!(await vertex.isAlive(deadTime)));
    }
});

it("edge_type.createEdge", async function () {
    for (const store of [
        new IndexedDbStore("edge_type.createEdge", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex1 = await instance.createVertex();
        const vertex2 = await instance.createVertex();
        const verb1 = await instance.createEdgeType();
        const edge1 = await verb1.createEdge(vertex1, vertex2);
        ensure(edge1.getSourceVertex().equals(vertex1));
        ensure(edge1.getTargetVertex().equals(vertex2));
        ensure(!edge1.getSourceVertex().equals(vertex2));
        ensure(edge1.getEdgeType().equals(verb1));
    }
});

it("from_to", async function () {
    for (const store of [
        new IndexedDbStore("from_to", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex1 = await instance.createVertex();
        const vertex2 = await instance.createVertex();
        const vertex3 = await instance.createVertex();
        const edge_type = await instance.createEdgeType();
        const beforeEdge12 = generateTimestamp();
        const edge12 = await edge_type.createEdge(vertex1, vertex2);
        const edge13 = await edge_type.createEdge(vertex1, vertex3);
        const edge11 = await edge_type.createEdge(vertex1, vertex1);
        const edge21 = await edge_type.createEdge(vertex2, vertex1);
        const edge22 = await edge_type.createEdge(vertex2, vertex2);
        const edge23 = await edge_type.createEdge(vertex2, vertex3);

        const edgesTo2 = await vertex2.getEdgesTo();
        ensure(edgesTo2.length === 2, `wtf: ${edgesTo2.length}`);
        ensure(edgesTo2[0].equals(edge12) || edgesTo2[0].equals(edge22));
        ensure(edgesTo2[1].equals(edge12) || edgesTo2[1].equals(edge22));
        ensure(!edgesTo2[0].equals(edgesTo2[1]));

        const edgesFrom2 = await vertex2.getEdgesFrom();
        ensure(edgesFrom2.length === 3);
        ensure(edgesFrom2[0].equals(edge21));
        ensure(edgesFrom2[1].equals(edge22));
        ensure(edgesFrom2[2].equals(edge23));

        await edge11.remove();
        const edgesFrom1 = await vertex1.getEdgesFrom();
        ensure(edgesFrom1.length === 2);
        ensure(edgesFrom1[0].equals(edge12));
        ensure(edgesFrom1[1].equals(edge13));

        // move edge13 to the front
        await edge13.remove(beforeEdge12);
        const edgesFrom1b = await vertex1.getEdgesFrom();
        ensure(edgesFrom1b.length === 2);
        ensure(edgesFrom1b[0].equals(edge13));
        ensure(edgesFrom1b[1].equals(edge12));
    }
});

it("edge_reorder", async function () {
    for (const store of [
        new IndexedDbStore("edge_reorder", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;

        const a = await instance.createVertex();
        const b = await instance.createVertex();

        const p = await instance.createEdgeType();
        const prop = await instance.createProperty();

        const beforeX = generateTimestamp();
        const x = await p.createEdge(a, b);
        const y = await p.createEdge(a, b);
        await prop.set(y, "foo");
        const afterX = generateTimestamp();
        const entries = await store.getAllEntries();
        ensure(entries.length === 3);
        const edges1 = await a.getEdgesFrom();
        ensure(
            edges1.length === 2 && edges1[0].equals(x) && edges1[1].equals(y),
            edges1.toString()
        );

        await y.remove(beforeX);

        const edges2 = await a.getEdgesFrom();
        const newY = edges2[0];
        ensure(
            edges2.length === 2 && newY.equals(y) && edges2[1].equals(x),
            edges2.toString()
        );
        // make sure property gets set again on "new" edge
        ensure((await prop.get(newY)) === "foo");

        const edges3 = await b.getEdgesTo(afterX);
        ensure(
            edges3.length === 2 && edges3[0].equals(x) && edges3[1].equals(y),
            edges3.toString()
        );

        const edges4 = await b.getEdgesTo();
        ensure(
            edges4.length === 2 && edges4[0].equals(y) && edges4[1].equals(x),
            edges4.toString()
        );
    }
});

it("vertex reset", async function () {
    for (const store of [
        new IndexedDbStore("vertex reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;
        const vertex = await instance.createVertex();
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(vertex, "foo");
        await prop2.set(vertex, "bar");
        const afterSet = generateTimestamp();
        await vertex.remove();
        await prop1.set(vertex, "foo2");
        await prop2.set(vertex, "bar2");
        const afterSecond = generateTimestamp();
        await vertex.reset({ toTime: afterSet });
        // Vertex should be alive again, and properties should be reset
        ensure(await vertex.isAlive());
        ensure((await prop1.get(vertex)) === "foo");
        ensure((await prop2.get(vertex)) === "bar");
        await vertex.reset({ toTime: afterSecond, skipProperties: true });
        // Vertex should be removed and properties should not have changed.
        ensure(!(await vertex.isAlive()));
        ensure((await prop1.get(vertex)) === "foo");
        ensure((await prop2.get(vertex)) === "bar");
    }
});

it("edge_type reset", async function () {
    for (const store of [
        new IndexedDbStore("edgetype reset", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;

        const vertex1 = await instance.createVertex();
        const vertex2 = await instance.createVertex();
        const vertex3 = await instance.createVertex();
        const edgeType = await instance.createEdgeType();
        const edge1 = await edgeType.createEdge(vertex1, vertex2);
        const edge2 = await edgeType.createEdge(vertex2, vertex1);
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(edgeType, "foo");
        await prop2.set(edgeType, "bar");
        const afterInit = generateTimestamp();
        const edge3 = await edgeType.createEdge(vertex1, vertex3);
        await prop1.set(edgeType, "foo");
        await prop2.set(edgeType, "baz");
        const afterSecond = generateTimestamp();

        await edgeType.reset({ toTime: afterInit });
        const edgesFrom1 = await vertex1.getEdgesFrom();
        const edgesFrom2 = await vertex2.getEdgesFrom();
        ensure(edgesFrom1.length === 1);
        ensure(edgesFrom2.length === 1);
        ensure((await prop1.get(edgeType)) === "foo");
        ensure((await prop2.get(edgeType)) === "bar");

        await edge1.remove();
        ensure((await vertex1.getEdgesFrom()).length === 0);

        await edgeType.reset({ toTime: afterSecond, skipProperties: true });
        ensure((await vertex1.getEdgesFrom()).length === 2);
        ensure((await vertex2.getEdgesFrom()).length === 1);
        ensure((await vertex3.getEdgesTo()).length === 1);
        ensure((await prop1.get(edgeType)) === "foo");
        ensure((await prop2.get(edgeType)) === "bar");
    }
});

it("edge property restoration", async function () {
    for (const store of [
        new IndexedDbStore("edge property restore", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database(store);
        await instance.ready;

        const vertex1 = await instance.createVertex();
        const vertex2 = await instance.createVertex();
        const edgeType = await instance.createEdgeType();
        const beforeEdges = generateTimestamp();
        const edge1 = await edgeType.createEdge(vertex1, vertex2);
        const edge2 = await edgeType.createEdge(vertex1, vertex2);
        const prop1 = await instance.createProperty();
        const prop2 = await instance.createProperty();
        await prop1.set(edge1, "p1e1");
        await prop2.set(edge1, "p2e1");
        await prop1.set(edge2, "p1e2");
        await prop2.set(edge2, "p2e2");
        const beforeRemove = generateTimestamp();
        await prop1.set(edge1, "changed");
        await prop2.set(edge1, "changed");
        await prop1.set(edge2, "changed");
        await prop2.set(edge2, "changed");
        await edge1.remove();

        await edgeType.reset({ toTime: beforeRemove });

        const edges = await vertex1.getEdgesFrom();
        ensure(edges.length === 2);
        ensure((await prop1.get(edges[0])) === "p1e1");
        ensure((await prop2.get(edges[0])) === "p2e1");
        ensure((await prop1.get(edges[1])) === "p1e2");
        ensure((await prop2.get(edges[1])) === "p2e2");

        // Move edge2 to the front
        await edge2.remove(beforeEdges);
        const edges2 = await vertex1.getEdgesFrom();

        ensure(edges2.length === 2);
        ensure((await prop1.get(edges2[0])) === "p1e2");
        ensure((await prop2.get(edges2[0])) === "p2e2");

        const beforePropDel = generateTimestamp();
        await prop2.delete(edges[0]); // delete e2 from prop2
        ensure((await prop2.get(edges[0])) === undefined);

        await edgeType.reset({ toTime: beforePropDel });
        const edges3 = await vertex1.getEdgesFrom();
        ensure(edges3.length === 2);
        ensure((await prop1.get(edges3[0])) === "p1e2");
        ensure((await prop2.get(edges3[0])) === "p2e2");
    }
});
