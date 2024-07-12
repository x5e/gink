import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import { Bundler } from "./Bundler";
import { ensure, entryToEdgeData, muidTupleToMuid } from "./utils";
import { Edge } from "./Edge";

export class Vertex extends Container {

    constructor(database: Database, address: Muid, containerBuilder?: ContainerBuilder) {
        super(database, address, Behavior.VERTEX);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.VERTEX);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() === Behavior.VERTEX);
        }
    }

    /**
    * Returns a promise that resolves to true showing if this placeholder is/was visible at the
    * specified time (default now), or false if it was softly deleted.
    * @returns undefined, a basic value, or a container
    */
    async isAlive(asOf?: AsOf): Promise<boolean> {
        const entry = await this.database.store.getEntryByKey(this.address, undefined, asOf);
        return (entry === undefined || !entry.deletion);
    }

    /**
     * Performs a soft delete of this graph node.
     */
    async remove(change?: Bundler | string): Promise<Muid> {
        return this.addEntry(undefined, Container.DELETION, change);
    }

    async revive(change?: Bundler | string): Promise<Muid> {
        return this.addEntry(undefined, Container.INCLUSION, change);
    }

    async getEdgesFrom(asOf?: AsOf) {
        return this.getEdges(true, asOf);
    }

    async getEdgesTo(asOf?: AsOf) {
        return this.getEdges(false, asOf);
    }

    async getEdges(source: boolean, asOf?: AsOf): Promise<Edge[]> {
        const entries = await this.database.store.getEntriesBySourceOrTarget(this.address, source, asOf);
        const edges: Edge[] = [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.behavior !== Behavior.EDGE_TYPE)
                continue;
            const edge = new Edge(
                this.database,
                muidTupleToMuid(entry.entryId),
                entryToEdgeData(entry));
            edges.push(edge);
        }
        return edges;
    }
}
