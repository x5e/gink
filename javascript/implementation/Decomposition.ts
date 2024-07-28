import { BundleBuilder, MetadataBuilder } from "./builders";
import { BundleInfo, BundleView, Bytes } from "./typedefs";
import { signingBundles, getSig, generateTimestamp } from "./utils";


export class Decomposition implements BundleView {
    readonly builder: BundleBuilder;
    readonly info: BundleInfo;
    constructor(readonly bytes: Bytes) {
        let body: Bytes = bytes;
        if (signingBundles) {
            body = body.subarray(64);
        }
        const bundleBuilder = this.builder = <BundleBuilder>BundleBuilder.deserializeBinary(body);
        const metadataBuilder: MetadataBuilder = bundleBuilder.getMetadata();
        this.info = {
            timestamp: metadataBuilder.getTimestamp(),
            medallion: metadataBuilder.getMedallion(),
            chainStart: metadataBuilder.getChainStart(),
            priorTime: metadataBuilder.getPrevious() || undefined,
            comment: metadataBuilder.getComment() || undefined,
        };
    }
}
