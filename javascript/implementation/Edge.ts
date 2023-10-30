import { Addressable } from "./Addressable";
import {GinkInstance} from "./GinkInstance";
import {Muid, Value} from "./typedefs";

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
}
