import { BundleBuilder } from "./builders";
import { BundleInfo, BundleView, Bytes } from "./typedefs";


export class Decomposition implements BundleView {
    readonly builder: BundleBuilder;
    readonly info: BundleInfo;
    constructor(readonly bytes: Bytes) {
        const builder = this.builder = <BundleBuilder>BundleBuilder.deserializeBinary(bytes);
        this.info = {
            timestamp: builder.getTimestamp(),
            medallion: builder.getMedallion(),
            chainStart: builder.getChainStart(),
            priorTime: builder.getPrevious() || undefined,
            comment: builder.getComment() || undefined,
        };
    }
}
