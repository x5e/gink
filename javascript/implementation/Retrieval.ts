import { BundleBuilder } from "./builders";
import { BundleInfo, BundleView, BundleBytes, Bytes } from "./typedefs";
import { signingBundles, getSig, generateTimestamp, ensure } from "./utils";

/**
 * Creates a bundle view from the encoded bytes and meta info, only parsing
 * the bytes to create the builder if actually needed.
 */
export class Retrieval implements BundleView {
    private bundleBytes: BundleBytes;
    private bundleInfo: BundleInfo;
    private bundleBuilder?: BundleBuilder;
    constructor(bundle: { bundleBytes: BundleBytes; bundleInfo: BundleInfo }) {
        this.bundleBytes = bundle.bundleBytes;
        this.bundleInfo = bundle.bundleInfo;
    }
    get info(): BundleInfo {
        return this.bundleInfo;
    }
    get bytes(): BundleBytes {
        return this.bundleBytes;
    }
    get builder(): BundleBuilder {
        if (!this.bundleBuilder) {
            let body: Bytes = this.bundleBytes;
            if (signingBundles) body = body.subarray(64);
            console.log(
                `length: ${body.length}, sig: ${getSig(body)}, ${generateTimestamp()}`,
            );
            this.bundleBuilder = <BundleBuilder>(
                BundleBuilder.deserializeBinary(body)
            );
        }
        return this.bundleBuilder;
    }
}
