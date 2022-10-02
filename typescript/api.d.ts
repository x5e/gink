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
export type Basic = number | string | boolean | null;  // TODO: add bigints, bytes

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

export interface Address {
    medallion: Medallion | undefined;
    timestamp: Timestamp | undefined;
    offset: number;
}

export interface ChangeSetInfo {
    timestamp: Timestamp;
    medallion: Medallion;
    chainStart: ChainStart;
    priorTime?: PriorTime;
    comment?: string;
}

export type ChangeSetInfoTuple = [Timestamp, Medallion, ChainStart, PriorTime, string];

export interface Store {
    getEntryBytes: (key: Basic, source?: Address) => Promise<Bytes | undefined>;
}

export declare class ChangeSet {
    get medallion(): Medallion | undefined;
}

export declare class Container {
    address?: Address;
}

export declare class GinkInstance {
    readonly initialized: Promise<void>;
    addChangeSet(changeSet: ChangeSet): Promise<ChangeSetInfo>;
    store: Store;
}

export declare class Schema extends Container {
    
    /**
     * Sets a key/value association in a Schema.
     * If a change set is supplied, the function will add the entry to that change set 
     * and return immediately (presumably you know what to do with a CS if you passed it in).
     * If the caller does not supply a change set, then one is created on the fly, and
     * then this method will await on the CS being added to the database instance.
     * This is to allow simple console usage like:
     *      await mySchema.set("foo", "bar");
     * @param key 
     * @param value 
     * @param changeSet an optional change set to put this in.
     * @returns a promise that resolves to the address of the newly created entry  
     */
    set(key: Basic, value: Basic | Container,  trxn?: ChangeSet): Promise<Address>;

    get(key: Basic): Promise<Basic|undefined>;

    delete(key: Basic, trxn?: ChangeSet): Promise<Address>;
}