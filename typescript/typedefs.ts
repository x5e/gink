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

/**
 * Will be the database objects used to change the data model.
 * Needs to be flushed out once the sync stuff has been merged in.
 */
export interface AddressableObject {
}

export declare class PendingCommit {
    medallion: Medallion;
}

/**
 * Intended to be a way to point to a particular AddressableObject even if
 * the commit its associated with hasn't been sealed yet.
 */
export interface Address {
    get medallion(): Medallion;
    get timestamp(): Timestamp | undefined;
    get offset(): number | undefined;
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
