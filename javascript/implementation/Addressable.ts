import { Database } from "./Database";
import { Muid } from "./typedefs";


export class Addressable {
    protected constructor(
        readonly database: Database,
        readonly address: Muid) {
    }

    public equals(other: any): boolean {
        if (!(other instanceof Addressable)) return false;
        return ((other.address.medallion == this.address.medallion) &&
            (other.address.offset == this.address.offset) &&
            (other.address.timestamp == this.address.timestamp));
    }

}
