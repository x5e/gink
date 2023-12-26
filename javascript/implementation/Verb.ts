import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Muid, AsOf, Value } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import { Bundler } from "./Bundler";
import { ensure } from "./utils";
import { Edge } from "./Edge";
import { Vertex } from "./Vertex";

export class Verb extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.VERB);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.VERB);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() == Behavior.VERB);
        }
    }

    async createEdge(source: Vertex | Muid, target: Vertex | Muid, value?: Value, change?: Bundler | string): Promise<Edge> {
        if (source instanceof Vertex)
            source = source.address;
        if (target instanceof Vertex)
            target = target.address;

        const key: [Muid | Container, Muid | Container] = [source, target];
        const muid = await this.addEntry(key, value, change);
        return new Edge(this.ginkInstance, muid,
            { source, target, action: this.address, value, effective: muid.timestamp });
    }



}
