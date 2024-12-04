import { Database } from "./Database";
import { Container } from "./Container";
import { Muid, AsOf, Meta, Bundler } from "./typedefs";
import { Behavior, } from "./builders";
import { entryToEdgeData, muidTupleToMuid } from "./utils";
import { Edge } from "./Edge";

export class Vertex extends Container {
    private constructor(
        database: Database,
        address: Muid,
    ) {
        super(database, address, Behavior.VERTEX);
    }

    static get(database?: Database, muid?: Muid): Vertex {
        database = database || Database.recent;
        if (! muid) {
            muid = {timestamp: -1, medallion: -1, offset: Behavior.VERTEX}
        }
        return new Vertex(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<Vertex> {
        database = database || Database.recent;
        const muid = await Container.addContainer({behavior: Behavior.VERTEX, database, meta});
        return new Vertex(database, muid);
    }


    toJson(indent: number | boolean, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        throw new Error("toJson not implemented for Vertex");
    }

    /**
     * Returns a promise that resolves to true showing if this placeholder is/was visible at the
     * specified time (default now), or false if it was softly deleted.
     * @returns undefined, a basic value, or a container
     */
    async isAlive(asOf?: AsOf): Promise<boolean> {
        const entry = await this.database.store.getEntryByKey(
            this.address,
            undefined,
            asOf
        );
        return entry === undefined || !entry.deletion;
    }

    public async size(asOf?: AsOf): Promise<number> {
        return await this.isAlive(asOf) ? 1 : 0;
    }

    /**
     * Performs a soft delete of this graph node.
     */
    async remove(meta?: Meta): Promise<Muid> {
        return this.addEntry(undefined, Container.DELETION, meta);
    }

    async revive(meta?: Meta): Promise<Muid> {
        return this.addEntry(undefined, Container.INCLUSION, meta);
    }

    async reset(toTime?: AsOf, recurse?, meta?: Meta): Promise<void> {
        const bundler: Bundler = await this.database.startBundle(meta);
        if (!toTime) {
            await this.remove(meta);
        } else {
            const aliveThen = await this.isAlive(toTime);
            const aliveNow = await this.isAlive();
            if (aliveThen !== aliveNow) {
                if (aliveThen) {
                    await this.revive({bundler});
                } else {
                    await this.remove({bundler});
                }
            }
        }
        if (! meta?.bundler) {
            await bundler.commit();
        }
    }

    async getEdgesFrom(asOf?: AsOf) {
        return this.getEdges(true, asOf);
    }

    async getEdgesTo(asOf?: AsOf) {
        return this.getEdges(false, asOf);
    }

    async getEdges(source: boolean, asOf?: AsOf): Promise<Edge[]> {
        const entries = await this.database.store.getEntriesBySourceOrTarget(
            this.address,
            source,
            asOf
        );
        const edges: Edge[] = [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.behavior !== Behavior.EDGE_TYPE) continue;
            const edge = Edge.get(
                this.database,
                muidTupleToMuid(entry.entryId),
                entryToEdgeData(entry)
            );
            edges.push(edge);
        }
        return edges;
    }
}
