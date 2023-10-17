import {GinkInstance} from "./GinkInstance";
import {Muid} from "./typedefs";


export class Addressable {
    protected constructor(
        readonly ginkInstance: GinkInstance,
        readonly address: Muid) {
    }
}
