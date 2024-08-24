import { BundleBuilder,  } from "./builders";
import { BundleInfo, BundleView, Bytes } from "./typedefs";
import { signingBundles, digest } from "./utils";


export class Decomposition implements BundleView {
    readonly builder: BundleBuilder;
    readonly info: BundleInfo;
    constructor(readonly bytes: Bytes) {
        let body: Bytes = bytes;
        if (signingBundles) {
            body = body.subarray(64);
        }
        const bundleBuilder = this.builder = <BundleBuilder>BundleBuilder.deserializeBinary(body);
        this.info = {
            timestamp: bundleBuilder.getTimestamp(),
            medallion: bundleBuilder.getMedallion(),
            chainStart: bundleBuilder.getChainStart(),
            priorTime: bundleBuilder.getPrevious() || undefined,
            comment: bundleBuilder.getComment() || undefined,
            hashCode: digest(bytes),
        };
    }
}
