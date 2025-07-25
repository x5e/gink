import { Behavior, BundleBuilder, ChangeBuilder } from "./builders";
import { DBSchema } from "idb";
export const PROTOCOL = "gink";

export type Bytes = Uint8Array;
export type BundleBytes = Bytes;
export type Medallion = number;
export type Timestamp = number;
export type ChainStart = Timestamp;
export type SeenThrough = Timestamp;
export type PriorTime = Timestamp;
export type Offset = number;
export type DirPath = string;
export type FilePath = string;
export type NumberStr = string;
export type ScalarKey = number | string | Bytes;
export type Value =
    | number
    | string
    | boolean
    | null
    | Bytes
    | Map<ScalarKey, Value>
    | Array<Value>
    | Date
    | BigInt;
export type BundleInfoTuple = [
    Timestamp,
    Medallion,
    ChainStart,
    PriorTime,
    string,
];
export type ChangeSetOffset = number;
export type AsOf = Timestamp | Date | ChangeSetOffset;
export type MuidTuple = [Timestamp, Medallion, Offset];
export type Cookies = Map<string, string>;
export type Indexable = MuidTuple;
export type ActorId = number; // process ID on the server side, something more complex in the browser
export type StorageKey = ScalarKey | MuidTuple | [MuidTuple, MuidTuple] | [];
export type Placement = {
    container: MuidTuple;
    key: StorageKey;
    placement: MuidTuple;
};

export interface BundleListener {
    (bundle: BundleView): Promise<void>;
}

export interface ClaimedChain {
    medallion: Medallion;
    chainStart: ChainStart;
    actorId: ActorId;
    claimTime: Timestamp;
}

export interface CallBack {
    (...args: any[]): void;
}

export interface Indexer {
    (value: Muid): Indexable;
}

export interface AuthFunction {
    (token: string): boolean;
}

export interface BroadcastFunc {
    (bundle: BundleView): Promise<void>;
}

export interface Muid {
    medallion: Medallion;
    timestamp: Timestamp;
    offset: number;
}

export interface BundleInfo {
    timestamp: Timestamp;
    medallion: Medallion;
    chainStart: ChainStart;
    priorTime?: PriorTime;
    hashCode?: Bytes;
    comment?: string;
}

export interface BundleView {
    bytes: BundleBytes;
    info: BundleInfo;
    builder: BundleBuilder;
}

// data structure to represent an Entry; some fields are tuples of 0 or 1 entries because
// the indexeddb system can't handle null or undefined in keys (but can handle tuples).
export interface Entry {
    behavior: Behavior;
    containerId: MuidTuple;

    /**
     * storageKey is a KeyType if the entry is for a Directory, a Timestamp if it's for a sequence,
     * MuidTuple if it's for a property, and empty list for a box.
     */
    storageKey: StorageKey;
    entryId: MuidTuple;
    pointeeList: Indexable[]; // use an empty list to denote no pointees
    value?: Value;
    expiry?: Timestamp;
    deletion?: boolean;
    placementId: MuidTuple;
    sourceList: Indexable[]; // used for edges
    targetList: Indexable[]; // used for edges
    purging?: boolean;
}

export interface Removal {
    removing: MuidTuple; // describes the placementId of the thing to be removed
    removalId: MuidTuple; // the ID of the movement or entry doing the removing
    containerId: MuidTuple;
    dest: number;
    entryId: MuidTuple;
}

export interface Movement {
    entryId: MuidTuple;
    movementId: MuidTuple;
    containerId: MuidTuple;
    dest: number;
    purge: boolean;
}

export interface Clearance {
    containerId: MuidTuple;
    clearanceId: MuidTuple;
    purging: boolean;
}

export interface EdgeData {
    source: Muid;
    target: Muid;
    etype?: Muid;
    value?: Value;
    effective?: number;
}

export interface KeyPair {
    publicKey: Bytes;
    secretKey: Bytes;
}

export interface Meta {
    bundler?: Bundler;
    comment?: string;
    identity?: string;
}

export interface Bundler {
    addChange(changeBuilder: ChangeBuilder): Muid;
    commit(comment?: string): Promise<BundleInfo>;
    medallion: number;
}

export interface Connection {
    subscribe(callback: () => void): () => void;
    get hasSentUnackedData(): boolean;
    get hasSentInitialSync(): boolean;
    get hasRecvInitialSync(): boolean;
    get hasSentGreeting(): boolean;
    get synced(): boolean;
    get ready(): Promise<void>;
    close(): void;
}

export interface Sealer {
    (changes: ChangeBuilder[], meta?: Meta): Promise<BundleInfo>;
}

export interface IndexedDbStoreSchema extends DBSchema {
    accumulatorTotals: {
        key: MuidTuple;
        value: bigint;
    };
    trxns: {
        key: BundleInfoTuple;
        value: BundleBytes;
    };
    chainInfos: {
        value: BundleInfo;
        key: [number, number];
    };
    activeChains: {
        value: ClaimedChain;
        key: [number]; // claimTime
    };
    containers: {
        key: MuidTuple;
        value: Bytes;
    };
    removals: {
        value: Removal;
        key: MuidTuple; // movementId
        indexes: {
            "by-container-movement": [MuidTuple, MuidTuple]; // containerId, movementId
            "by-removing": [MuidTuple, MuidTuple]; // removing, removalId
        };
    };
    clearances: {
        value: Clearance;
        key: [MuidTuple, MuidTuple]; // ["containerId", "clearanceId"]
    };
    entries: {
        value: Entry;
        key: MuidTuple;
        indexes: {
            "by-container-key-placement": [
                MuidTuple,
                ScalarKey | Timestamp | MuidTuple | [],
                MuidTuple,
            ];
            "by-container-name": [MuidTuple, string]; // for use with global property and container names
            "by-key-placement": [StorageKey, MuidTuple]; // for use with properties and the containers they describe
            pointees: Indexable;
            locations: [MuidTuple, MuidTuple];
            sources: Indexable;
            targets: Indexable;
        };
    };
    identities: {
        value: string;
        key: [Medallion, ChainStart];
    };

    verifyKeys: {
        value: Bytes;
        key: [Medallion, ChainStart];
    };

    secretKeys: {
        value: Bytes;
        key: Bytes;
    };

    symmetricKeys: {
        value: Bytes;
        key: number;
    };
}
