import {
    builderToMuid,
    ensure,
    generateTimestamp, dehydrate,
    matches,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    sameData,
    unwrapKey,
    unwrapValue
} from "./utils";
import {
    AsOf,
    BundleBytes,
    BundleInfo,
    BundleInfoTuple,
    Bytes,
    ChainStart,
    ClaimedChains,
    Clearance,
    Entry, Indexable,
    IndexedDbStoreSchema,
    KeyType,
    Medallion,
    Muid,
    MuidTuple,
    Offset,
    Removal,
    SeenThrough,
    Timestamp,
} from "./typedefs";
import { ChainTracker } from "./ChainTracker";
import { Store } from "./Store";
import { Behavior, BundleBuilder, ChangeBuilder, EntryBuilder, MovementBuilder, MuidBuilder, } from "./builders";
import { Container } from './Container';

export class MemoryStore {
    ready: Promise<void>;
    private trxns: Map<string, any>; // may want to specify value eventually
    private chainInfos: Map<[Medallion, ChainStart], BundleInfo>;
    private activeChains: Map<[Medallion, ChainStart], boolean>;
    private clearances: Map<string, any>;
    private containers: Map<string, any>;
    private removals: Map<string, any>;
    private entries: Map<Muid, Entry>;

    constructor(private keepingHistory = true) {
        this.ready = this.initialize();
    }

    private initialize(): Promise<void> {
        this.trxns = new Map();
        this.chainInfos = new Map();
        this.activeChains = new Map();
        this.clearances = new Map();
        this.containers = new Map();
        this.removals = new Map();
        this.entries = new Map();
        return Promise.resolve();
    }

    getBackRefs(pointingTo: Muid): Entry[] {
        const backRefs: Entry[] = [];
        for (const [muid, entry] of this.entries.entries()) {
            if (muid == pointingTo && entry.pointeeList) {
                backRefs.push(entry);
            }
        }
        return backRefs;
    }

    getClaimedChains(): ClaimedChains {
        const result = new Map();
        for (const [medallion, chainStart] of this.activeChains) {
            result.set(medallion, chainStart);
        }
        return result;
    }

    claimChain(medallion: Medallion, chainStart: ChainStart): void {
        this.activeChains.set([medallion, chainStart], true);
    }

    getChainTracker(): ChainTracker {
        const hasMap: ChainTracker = new ChainTracker({});
        for (const bundleInfo of this.chainInfos.values()) {
            hasMap.markAsHaving(bundleInfo);
        }
        return hasMap;
    }

    getSeenThrough(key: [Medallion, ChainStart]): SeenThrough {
        return this.chainInfos.get(key).timestamp;
    }

    getChainInfos(): Iterable<BundleInfo> {
        return this.chainInfos.values();
    }


}
