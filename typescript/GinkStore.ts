import { GinkTrxnBytes, HasMap, CommitInfo } from "./typedefs"

export interface GinkStore {

    readonly initialized: Promise<void>;

    /**
     * Generates a HasMap describing how much of each chain this store has.
     */
    getHasMap: () => Promise<HasMap>;

    /**
     * Tries to add a transaction to this store; returns truthy
     * if actually added, false if not (e.g. if already has it).
     * If adding to the store, will also update the passed HasMap.
     * Will throw if passed a transaction without the proceeding
     * ones in the associated chain.
     */
    addTransaction: (trxn: GinkTrxnBytes, hasMap?: HasMap) => Promise<CommitInfo | null>;

    /**
     * Send to the callback transactions that a peer needs
     * as evidenced by the HasMap (or all if no HasMap passed).
     * The commits must be sent to the callback ordered by time.
     * The passed HasMap should be updated as messages are sent.
     * @returns the passed HasMap, or a new one appropriately populated.
     */
    getNeededTransactions: (
        callback: (commitBytes: GinkTrxnBytes, commitInfo: CommitInfo) => void,
        peerHasMap?: HasMap) => Promise<HasMap>;

    close: () => Promise<void>;
}