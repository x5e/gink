import { Database } from "./Database";
import { Container } from "./Container";
import { EdgeData, Muid, Value, Timestamp } from "./typedefs";
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

    async createEdge(
            source: Vertex,
            target: Vertex,
            value?: Value,
            change?: Bundler | string): Promise<Edge> {
        const muid = await this.addEntry([source, target], value, change);
        const edgeData: EdgeData = {
            source: source.address,
            target: target.address,
            action: this.address,
            value,
        };
        return new Edge(this.database, muid, edgeData);
    }
}
