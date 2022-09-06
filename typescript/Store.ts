import { CommitBytes, CommitInfo, ClaimedChains, Medallion, ChainStart } from "./typedefs"
import { ChainTracker } from "./ChainTracker"

export interface Store {

    /**
     * Can be awaited on for the underlying store to be ready for operations.
     * Methods of the store should await on this, so if initialization fails then
     * no other method will work either.
     */
    readonly initialized: Promise<void>;

    /**
     * Generates a HasMap describing how much of each chain this store has.
     * Note that this might be expensive to compute (e.g. require going to disk),
     * so it's best for a user of this class to get a has map and then update that
     * in-memory accounting object rather than re-requesting all the time.
     *
     * Implicitly awaits on this.initialized;
     */
    getChainTracker: () => Promise<ChainTracker>;

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
    addCommit: (trxn: CommitBytes, commitInfo: CommitInfo) => Promise<Boolean>;

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
    getCommits: (callback: (commitBytes: CommitBytes, commitInfo: CommitInfo) => void) => Promise<void>;

    /**
     * Closes the underlying data store.  Implicitly awaits on the this.initialized promise.
     */
    close: () => Promise<void>;
}
