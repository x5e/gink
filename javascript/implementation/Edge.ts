import { Addressable } from "./Addressable";
import { Database } from "./Database";
import { AsOf, EdgeData, Muid, Value } from "./typedefs";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";
import { muidToBuilder, entryToEdgeData } from "./utils";
import { Bundler } from "./Bundler";
import { ChangeBuilder, MovementBuilder } from "./builders";

export class Edge extends Addressable {

    private source: Muid;
    private target: Muid;
    private action: Muid;
    private value?: Value;
    private effective: number;

    constructor(
        database: Database,
        address: Muid,
        data: EdgeData) {
        super(database, address);
        this.setFromEdgeData(data);
    }

    private setFromEdgeData(data: EdgeData) {
        this.source = data.source;
        this.target = data.target;
        this.action = data.action;
        this.value = data.value;
        this.effective = data.effective;
    }

    static async load(database: Database, address: Muid): Promise<Edge> {
        const entry = await database.store.getEntryById(address, address.timestamp + 1);
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

    async isAlive(asOf?: AsOf): Promise<boolean> {
        return 0 != await this.getPosition(asOf);
    }

    async getPosition(asOf?: AsOf): Promise<number> {
        const entry = await this.database.store.getEntryById(this.address, asOf);
        if (!entry) {
            return 0;
        } else {
            return <number>entry.effectiveKey;
        }
    }

    async remove(dest?: number, purge?: boolean, bundlerOrComment?: string | Bundler) {
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        const movementBuilder = new MovementBuilder();
        movementBuilder.setEntry(muidToBuilder(this.address));
        if (dest)
            movementBuilder.setDest(dest);
        movementBuilder.setContainer(muidToBuilder(this.action));
        if (purge)
            movementBuilder.setPurge(true);
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setMovement(movementBuilder);
        bundler.addChange(changeBuilder);
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }
}
