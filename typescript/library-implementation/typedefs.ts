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
export type FilePath = string;
export type NumberStr = string;
export type KeyType = number | string;
export type Value = number | string | boolean | null | Bytes | Object;
export type ChangeSetInfoTuple = [Timestamp, Medallion, ChainStart, PriorTime, string];

export interface CommitListener {
    (commitInfo: ChangeSetInfo): Promise<void>;
}

export interface CallBack {
    (value: any): void;
}

export interface ServerArgs {
    port?: NumberStr;
    sslKeyFilePath?: FilePath;
    sslCertFilePath?: FilePath;
    medallion?: NumberStr;
    staticPath?: string;
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
