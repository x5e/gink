import { Behavior } from "gink/protoc.out/behavior_pb";

export type Bytes = Uint8Array;
export type GreetingBytes = Bytes;
export type BundleBytes = Bytes;
export type Medallion = number;
export type Timestamp = number;
export type ChainStart = Timestamp;
export type SeenThrough = Timestamp;
export type PriorTime = Timestamp;
export type ClaimedChains = Map<Medallion, ChainStart>;
export type Offset = number;
export type DirPath = string;
export type FilePath = string;
export type NumberStr = string;
export type KeyType = number | string;
export type Value = number | string | boolean | null | Bytes | Map<KeyType, Value> | Array<Value> | Date;
export type BundleInfoTuple = [Timestamp, Medallion, ChainStart, PriorTime, string];
export type ChangeSetOffset = number;
export type AsOf = Timestamp | Date | ChangeSetOffset;
export type MuidTuple = [Timestamp, Medallion, Offset];
export type Cookies = Map<string, string>;

export interface CommitListener {
    (commitInfo: BundleInfo): Promise<void>;
}

export interface CallBack {
    (value?: any): void;
}

export interface AuthFunction {
    (cookies: Cookies, resource: string): boolean;
}

export interface Muid {
    medallion: Medallion | undefined;
    timestamp: Timestamp | undefined;
    offset: number;
}

export type MuidBytesPair = [Muid, Bytes];

export type MuidContentsPair = [Muid, any];

export interface BundleInfo {
    timestamp: Timestamp;
    medallion: Medallion;
    chainStart: ChainStart;
    priorTime?: PriorTime;
    comment?: string;
}

// data structure to represent an Entry; some fields are tuples of 0 or 1 entries because
// the indexeddb system can't handle null or undefined in keys (but can handle tuples).
export interface Entry {
    behavior: Behavior,
    containerId: MuidTuple;
    semanticKey: KeyType[]; // use an empty list to denote no semantic key
    entryId: MuidTuple;
    pointeeList: MuidTuple[]; // use an empty list to denote no pointees
    value?: Value;
    expiry?: Timestamp;
    deleting?: boolean;
}
