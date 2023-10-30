import { Addressable } from "./Addressable";
import {GinkInstance} from "./GinkInstance";
import {Muid, Value} from "./typedefs";
import {Vertex} from "./Vertex";
import {Verb} from "./Verb";

export class Edge extends Addressable {

    constructor(
        ginkInstance: GinkInstance,
        address: Muid,
        readonly source: Muid,
        readonly target: Muid,
        readonly action: Muid,
        readonly value?: Value,
        ) {
            super(ginkInstance, address);
        }

        getSourceVertex(): Vertex {
            return new Vertex(this.ginkInstance, this.source);
        }

        getTargetVertex(): Vertex {
            return new Vertex(this.ginkInstance, this.target);
        }

        getEdgeType(): Verb {
            return new Verb(this.ginkInstance, this.action)
        }
}
