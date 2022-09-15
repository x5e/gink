export type GreetingBytes = Uint8Array;
export type CommitBytes = Uint8Array;
export type Medallion = number;
export type Timestamp = number;
export type ChainStart = Timestamp;
export type SeenThrough = Timestamp;
export type PriorTime = Timestamp;
export type ClaimedChains = Map<Medallion, ChainStart>;
export type Offset = number;
export type FilePath = string;
export type NumberStr = string;
export type Basic = number | string | boolean | null;  // TODO: add bigints, bytes

export interface CommitInfo {
    timestamp: Timestamp;
    medallion: Medallion;
    chainStart: ChainStart;
    priorTime?: PriorTime;
    comment?: string;
}

export interface CommitListener {
    (commitInfo: CommitInfo): Promise<void>;
}

export interface CallBack {
    (value: any): void;
}

export declare class PendingCommit {
    medallion: Medallion;
}

/**
 * Intended to be a way to point to a particular AddressableObject even if
 * the commit its associated with hasn't been sealed yet.
 */
export interface Address {
    medallion: Medallion | undefined;
    timestamp: Timestamp | undefined;
    offset: number;
}

export interface ServerArgs {
    port?: NumberStr;
    sslKeyFilePath?: FilePath;
    sslCertFilePath?: FilePath;
    medallion?: NumberStr;
    staticPath?: string;
}

export interface ContainerArgs {
    address?: Address,
}
