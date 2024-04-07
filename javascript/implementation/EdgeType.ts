import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, Value } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { Edge } from "./Edge";
import { Vertex } from "./Vertex";

export class EdgeType extends Container {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.EDGE_TYPE);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.EDGE_TYPE);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() == Behavior.EDGE_TYPE);
        }
    }

    async createEdge(source: Vertex | Muid, target: Vertex | Muid, value?: Value, change?: Bundler | string): Promise<Edge> {
        if (source instanceof Vertex)
            source = source.address;
        if (target instanceof Vertex)
            target = target.address;

        const key: [Muid | Container, Muid | Container] = [source, target];
        const muid = await this.addEntry(key, value, change);
        return new Edge(this.database, muid,
            { source, target, action: this.address, value, effective: muid.timestamp });
    }



}
