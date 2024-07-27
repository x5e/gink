import { BundleBuilder, HeaderBuilder } from "./builders";
import { BundleInfo, BundleView, Bytes } from "./typedefs";
import { signingBundles, getSig } from "./utils";


export class Decomposition implements BundleView {
    readonly builder: BundleBuilder;
    readonly info: BundleInfo;
    constructor(readonly bytes: Bytes) {
        let body: Bytes = bytes;
        if (signingBundles) {
            body = body.subarray(64);
        }
        console.log(`length: ${body.length}, sig: ${getSig(body)}`);
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
