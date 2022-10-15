import { ChainTracker } from "./ChainTracker";
import { Medallion, ChainStart, SeenThrough, Muid, Bytes, KeyType, ChangeSetInfo,
    ClaimedChains, MuidBytesPair
    } from "./typedefs";

export interface Store {

    /**
     * Can be awaited on for the underlying store to be ready for operations.
     * Methods of the store should await on this, so if initialization fails then
     * no other method will work either.
     */
    readonly initialized: Promise<void>;

    /**
     * Generates a ChainTracker describing how much of each chain this store has.
     *
     * Implicitly awaits on this.initialized;
     */
    getChainTracker: () => Promise<ChainTracker>;

    /**
     * Check the store to see how far along a given chain it has data for.
     */
    getSeenThrough: (key: [Medallion, ChainStart]) => Promise<SeenThrough | undefined>

    /**
     * Returns a set of chains that may be appended to.
     * You'll need to getChainTracker to figure out the last 
     * commit for any chain you want to add to though.
     *
     * Implicitly awaits on this.initialized;
     */
    getClaimedChains: () => Promise<ClaimedChains>;

    /**
     * Mark a chain as being owned by this store.
     *
     * Implicitly awaits on this.initialized;
     */
    claimChain: (medallion: Medallion, chainStart: ChainStart) => Promise<void>;

    /**
     * Mark a chain as being closed and unavailable for new commits.
     * (Not really necessary when medallions are randomly generated).
     * endChain: (medallion: Medallion) => Promise<void>;
     * Needs to be added for version 2;
     */

    /**
     * Tries to add a commit to this store; returns truthy
     * if actually added, false if not (e.g. if already has it).
     * Will throw if passed a commit without the proceeding
     * ones in the associated chain.
     *
     * Implicitly awaits on this.initialized;
     */
    addChangeSet: (changeSetBytes: Bytes) => Promise<ChangeSetInfo | undefined>;

    /**
     * Get all commits from a store ordered by [timestamp, medallion].
     * Intended to be used to send to a peer.
     * 
     * The callback should *NOT* await on anything (will cause problems 
     * with the IndexedDb implementation if you do).
     * See https://github.com/google/gink/issues/28
     *
     * Implicitly awaits on this.initialized;
     */
    getCommits: (callback: (commitBytes: Bytes, commitInfo: ChangeSetInfo) => void) => Promise<void>;

    /**
     * Gets the protobuf bytes corresponding to a particular container's address.
     */
    // TODO maybe return an actual data structure ?
    getContainerBytes: (address: Muid) => Promise<Bytes | undefined>;

    /**
     * Does a lookup for a given container at a specified address and key, and returns the most
     * recent entry stored (if there is any).
     */
    getEntry(source: Muid, key?: KeyType|Muid, asOf?: number): Promise<[Muid, Bytes] | undefined>;

    getVisibleEntries(source: Muid, through?: number, asOf?: number): Promise<MuidBytesPair[]>;

    getEntries(source: Muid, asOf?: number): Promise<[KeyType, Muid, Bytes][]> ;

    /**
     * Closes the underlying data store.  Implicitly awaits on the this.initialized promise.
     */
    close: () => Promise<void>;
}
