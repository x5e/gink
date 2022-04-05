import { CommitBytes, HasMap, CommitInfo, ClaimedChains, Medallion, ChainStart } from "./typedefs"

export interface Store {

    readonly initialized: Promise<void>;

    /**
     * Generates a HasMap describing how much of each chain this store has.
     */
    getHasMap: () => Promise<HasMap>;

    /**
     * Returns a set of chains that may be appended to.
     * You'll need to getHasMap to figure out the last 
     * commit for any chain you want to add to though.
     */
    getClaimedChains: () => Promise<ClaimedChains>;

    /**
     * Mark a chain as being owned by this store.
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
     * If adding to the store, will also update the passed HasMap.
     * Will throw if passed a commit without the proceeding
     * ones in the associated chain.
     */
    addCommit: (trxn: CommitBytes, hasMap?: HasMap) => Promise<CommitInfo | null>;

    /**
     * Send to the callback commits that a peer needs
     * as evidenced by the HasMap (or all if no HasMap passed).
     * The commits must be sent to the callback ordered by time.
     * The passed HasMap should be updated as messages are sent.
     * @returns the passed HasMap, or a new one appropriately populated.
     */
    getNeededCommits: (
        callback: (commitBytes: CommitBytes, commitInfo: CommitInfo) => void,
        peerHasMap?: HasMap) => Promise<HasMap>;

    close: () => Promise<void>;
}