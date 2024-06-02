import { Muid } from "./typedefs";


export class Addressable {
    protected constructor(readonly address: Muid) { }

    public equals(other: any): boolean {
        if (!(other instanceof Addressable)) return false;
        return ((other.address.medallion == this.address.medallion) &&
            (other.address.offset == this.address.offset) &&
            (other.address.timestamp == this.address.timestamp));
    }

    get timestamp() { return this.address.timestamp; }
    get medallion() { return this.address.medallion; }
    get offset() { return this.address.offset; }

}
