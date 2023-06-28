import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { KeyType, Muid, AsOf } from "./typedefs";
import { Bundler } from "./Bundler";
import { ensure, muidToString } from "./utils";
import { toJson } from "./factories"
import { Behavior, ContainerBuilder } from "./builders";

export class KeySet extends Container {

    constructor(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, Behavior.ROLE);
        if (this.address.timestamp < 0) {
            ensure(address.offset == Behavior.ROLE);
        } else {
            ensure(containerBuilder.getBehavior() == Behavior.ROLE);
        }
    }
}
