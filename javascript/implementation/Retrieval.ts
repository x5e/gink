import { BundleBuilder } from "./builders";
import { BundleInfo, BundleView, BundleBytes } from "./typedefs";

/**
 * Creates a bundle view from the encoded bytes and metadata info, only parsing
 * the bytes to create the builder if actually needed.
 */
export class Retrieval implements BundleView {
    private bundleBytes: BundleBytes;
    private bundleInfo: BundleInfo;
    private bundleBuilder?: BundleBuilder;
    constructor(bundle: { bundleBytes: BundleBytes, bundleInfo: BundleInfo; }) {
        this.bundleBytes = bundle.bundleBytes;
        this.bundleInfo = bundle.bundleInfo;
    }
    get info(): BundleInfo { return this.bundleInfo; }
    get bytes(): BundleBytes { return this.bundleBytes; }
    get builder(): BundleBuilder {
        if (!this.bundleBuilder) {
            this.bundleBuilder = <BundleBuilder>BundleBuilder.deserializeBinary(this.bundleBytes);
        }
        return this.bundleBuilder;
    }
}
