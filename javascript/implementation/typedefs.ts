import { Behavior } from "./builders";
import {DBSchema} from "idb";

export type Bytes = Uint8Array;
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
export type KeyType = number | string | Bytes;
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
    (value?): void;
}

export interface AuthFunction {
    (cookies: Cookies, resource: string): boolean;
}

export interface Muid {
    medallion: Medallion | undefined;
    timestamp: Timestamp | undefined;
    offset: number;
}

export interface Chain {
    medallion: Medallion;
    chainStart: ChainStart;
}


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

    /**
     * effectiveKey is a KeyType if the entry is for a Directory, a Timestamp if it's for a sequence,
     * MuidTuple if it's for a property, and empty list for a box.
     */
    effectiveKey: KeyType | Timestamp | MuidTuple | [];
    entryId: MuidTuple;
    pointee: MuidTuple | [];
    value?: Value;
    expiry?: Timestamp;
    deletion?: boolean;
    placementId: MuidTuple;
}

export interface Removal {
    removing: MuidTuple;  // describes the placementId of the thing to be removed
    removalId: MuidTuple; // the ID of the movement or entry doing the removing
    containerId: MuidTuple;
    dest: number;
    entryId: MuidTuple;
}

export interface Clearance {
    containerId: MuidTuple;
    clearanceId: MuidTuple;
    purging: boolean;
}

export interface IndexedDbStoreSchema extends DBSchema {
    trxns: {
        key: BundleInfoTuple;
        value: BundleBytes;
    };
    chainInfos: {
        value: BundleInfo;
        key: [number, number];
    };
    activeChains: {
        value: Chain;
        key: number; // medallion
    };
    containers: {
        key: MuidTuple;
        value: Bytes;
    };
    removals: {
        value: Removal;
        key: MuidTuple // movementId
        indexes: {
            'by-container-movement': [MuidTuple, MuidTuple]; // containerId, movementId
            'by-removing': [MuidTuple, MuidTuple]; // removing, removalId
        }
    };
    clearances: {
        value: Clearance;
        key: [MuidTuple, MuidTuple]; // ["containerId", "clearanceId"]
    };
    entries: {
      value: Entry;
      key: MuidTuple;
      indexes: {
          "by-container-key-placement": [MuidTuple,  KeyType | Timestamp | MuidTuple | [], MuidTuple];
          "pointee-behavior-placement": [MuidTuple | [], Behavior, MuidTuple];
          'locations': [MuidTuple, MuidTuple];
          "by-behavior-key-container-placement": [
                Behavior, KeyType | Timestamp | MuidTuple | [], MuidTuple, MuidTuple];
      };
    };
}
