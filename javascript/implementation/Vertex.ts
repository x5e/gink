import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Muid, AsOf, Entry } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import { Bundler } from "./Bundler";
import { ensure, entryToEdgeData, muidTupleToMuid } from "./utils";
import { Edge } from "./Edge";

export class Vertex extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.VERTEX);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.VERTEX);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() == Behavior.VERTEX);
        }
    }

    /**
    * Returns a promise that resolves to true showing if this placeholder is/was visible at the
    * specified time (default now), or false if it was softly deleted.
    * @returns undefined, a basic value, or a container
    */
    async isAlive(asOf?: AsOf): Promise<boolean> {
        const entry = await this.ginkInstance.store.getEntryByKey(this.address, undefined, asOf);
        return (entry === undefined || !entry.deletion);
    }

    /**
     * Performs a soft delete of this graph node.
     */
    async remove(change?: Bundler | string): Promise<Muid> {
        return this.addEntry(undefined, Container.DELETION, change);
    }

    async getEdgesFrom(asOf?: AsOf) {
        return this.getEdges(true);
    }

    async getEdgesTo(asOf?: AsOf) {
        return this.getEdges(false);
    }

    async getEdges(source: boolean, asOf?: AsOf): Promise<Edge[]> {
        const entries = await this.ginkInstance.store.getEntriesBySourceOrTarget(this.address, source, asOf);
        const thisVertex = this;
        const edges = entries.map(
            function (entry: Entry) {
                return new Edge(thisVertex.ginkInstance, muidTupleToMuid(entry.entryId), entryToEdgeData(entry));
            }
        )
        return edges;
    }
}
