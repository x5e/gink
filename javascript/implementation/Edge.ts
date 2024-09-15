import { Addressable } from "./Addressable";
import { Database } from "./Database";
import { AsOf, EdgeData, Muid, Value, Timestamp } from "./typedefs";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";
import { entryToEdgeData } from "./utils";
import { Bundler } from "./Bundler";
import { movementHelper } from "./store_utils";

export class Edge extends Addressable {
    private source: Muid;
    private target: Muid;
    private action: Muid;
    private value?: Value;

    constructor(
        readonly database: Database,
        address: Muid,
        data: EdgeData
    ) {
        super(address);
        this.setFromEdgeData(data);
    }

    private setFromEdgeData(data: EdgeData) {
        this.source = data.source;
        this.target = data.target;
        this.action = data.action;
        this.value = data.value;
    }

    static async load(database: Database, address: Muid): Promise<Edge> {
        const entry = await database.store.getEntryById(
            address,
            address.timestamp + 1
        );
        if (!entry) {
            throw new Error("edge not found");
        }
        return new Edge(database, address, entryToEdgeData(entry));
    }

    getSourceVertex(): Vertex {
        return new Vertex(this.database, this.source);
    }

    getTargetVertex(): Vertex {
        return new Vertex(this.database, this.target);
    }

    getEdgeType(): EdgeType {
        return new EdgeType(this.database, this.action);
    }

    getValue(): Value | undefined {
        return this.value;
    }

    /**
     * NOTE: If this edge has been removed, or if its edgeType has been reset, this method will ALWAYS return false.
     * If its edgeType has been reset, it has been replaced with a new edge that has the exact same source, target, value,
     * and properties. Check getEdgesTo and getEdgesFrom on the source and target vertices to find replaced edges.
     */
    async isAlive(asOf?: AsOf): Promise<boolean> {
        return 0 !== (await this.getEffective(asOf));
    }

    async getEffective(asOf?: AsOf): Promise<Timestamp> {
        const entry = await this.database.store.getEntryById(
            this.address,
            asOf
        );
        if (!entry) {
            return 0;
        } else {
            return <number>entry.storageKey;
        }
    }

    async remove(
        dest?: number,
        purge?: boolean,
        bundlerOrComment?: string | Bundler
    ) {
        if (!(await this.isAlive())) throw new Error("this edge is not alive.");
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        await movementHelper(bundler, this.address, this.action, dest, purge);
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }
}
