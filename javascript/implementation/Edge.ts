import { Addressable } from "./Addressable";
import { GinkInstance } from "./GinkInstance";
import { AsOf, EdgeData, Muid, Value } from "./typedefs";
import { Vertex } from "./Vertex";
import { Verb } from "./Verb";
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
        ginkInstance: GinkInstance,
        address: Muid,
        data: EdgeData) {
        super(ginkInstance, address);
        this.setFromEdgeData(data);
    }

    private setFromEdgeData(data: EdgeData) {
        this.source = data.source;
        this.target = data.target;
        this.action = data.action;
        this.value = data.value;
        this.effective = data.effective;
    }

    static async load(ginkInstance: GinkInstance, address: Muid): Promise<Edge> {
        const entry = await ginkInstance.store.getEntryById(address, address.timestamp + 1);
        if (!entry) {
            throw new Error("edge not found");
        }
        return new Edge(ginkInstance, address, entryToEdgeData(entry));
    }

    getSourceVertex(): Vertex {
        return new Vertex(this.ginkInstance, this.source);
    }

    getTargetVertex(): Vertex {
        return new Vertex(this.ginkInstance, this.target);
    }

    getEdgeType(): Verb {
        return new Verb(this.ginkInstance, this.action);
    }

    getValue(): Value | undefined {
        return this.value;
    }

    async isAlive(asOf?: AsOf): Promise<boolean> {
        return 0 != await this.getPosition(asOf);
    }

    async getPosition(asOf?: AsOf): Promise<number> {
        const entry = await this.ginkInstance.store.getEntryById(this.address, asOf);
        if (!entry) {
            return 0;
        } else {
            return <number>entry.effectiveKey;
        }
    }

    getOriginalPosition(): number {
        return this.effective;
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
            await this.ginkInstance.addBundler(bundler);
        }
    }
}
