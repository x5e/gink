export type Bytes = Uint8Array;
export type GreetingBytes = Bytes;
export type ChangeSetBytes = Bytes;
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
export type ChangeSetInfoTuple = [Timestamp, Medallion, ChainStart, PriorTime, string];
export type ChangeSetOffset = number;
export type AsOf = Timestamp | Date | ChangeSetOffset;
export type MuidTuple = [Timestamp, Medallion, Offset];
export type Cookies = Map<string, string>;

export interface CommitListener {
    (commitInfo: ChangeSetInfo): Promise<void>;
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

export interface ChangeSetInfo {
    timestamp: Timestamp;
    medallion: Medallion;
    chainStart: ChainStart;
    priorTime?: PriorTime;
    comment?: string;
}

export enum EntryType {
    BOXED = 0,
    KEYED = 1,
    QUEUE = 2,
}

export interface Entry {
    entryType: EntryType,
    containerId: MuidTuple;
    semanticKey: KeyType[];
    entryId: MuidTuple;
    pointeeList: MuidTuple[];
    immediate?: Value;
    expiry?: Timestamp;
    deleting?: boolean;
}