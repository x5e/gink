import { GinkInstance } from "./GinkInstance";
import { PendingCommit } from "./PendingCommit";
import { Entry } from "entry_pb";
import { Value as ValueMessage } from "value_pb";
import { Muid as MuidMessage } from "muid_pb";
import { Address, ContainerArgs } from "./typedefs";

export class Container {
    readonly ginkInstance: GinkInstance;
    constructor(private args: ContainerArgs) {

    }

    get address(): Address {
        throw new Error("not implemented");
    }

    async set(key: string, value: string|Container, commit?: PendingCommit): Promise<Address> {
        let immediate: boolean = false;
        if (!commit) {
            immediate = true;
            commit = new PendingCommit();
        }
        const keyProto = new ValueMessage();
        keyProto.setCharacters(key);
        const entry = new Entry();
        entry.setKey(keyProto);
        if (typeof value == "string") {
            const valueProto = new ValueMessage();
            valueProto.setCharacters(value);
            entry.setValue(valueProto);            
        } else {
            const address = value.address;
            const muid = new MuidMessage();
            if (address.medallion && address.medallion != commit.medallion)
                muid.setMedallion(address.medallion);
            if (address.timestamp) // not set if in this same commit
                muid.setTimestamp(address.timestamp);
            muid.setOffset(address.offset);
        }
    }
}
