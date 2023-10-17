import { Addressable } from "./Addressable";
import {GinkInstance} from "./GinkInstance";
import {Muid} from "./typedefs";
import { EntryBuilder, ChangeBuilder, Behavior, ClearanceBuilder } from "./builders";

export class Edge extends Addressable {

    constructor(
        ginkInstance: GinkInstance,
        address: Muid,
        ) {
            super(ginkInstance, address)
    }
}
