import { BundleBuilder, HeaderBuilder } from "./builders";
import { BundleInfo, BundleView, Bytes } from "./typedefs";


export class Decomposition implements BundleView {
    readonly builder: BundleBuilder;
    readonly info: BundleInfo;
    constructor(readonly bytes: Bytes) {
        const body = bytes.subarray(64);
        const bundleBuilder = this.builder = <BundleBuilder>BundleBuilder.deserializeBinary(body);
        const headerBuilder: HeaderBuilder = bundleBuilder.getHeader();
        this.info = {
            timestamp: headerBuilder.getTimestamp(),
            medallion: headerBuilder.getMedallion(),
            chainStart: headerBuilder.getChainStart(),
            priorTime: headerBuilder.getPrevious() || undefined,
            comment: headerBuilder.getComment() || undefined,
        };
    }
}
