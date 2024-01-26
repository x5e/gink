import { ChainTracker } from "./ChainTracker";
import { Container } from "./Container";
import {
    Medallion,
    ChainStart,
    Muid,
    Bytes,
    KeyType,
    BundleInfo,
    ClaimedChain,
    Entry,
    AsOf,
    ActorId,
} from "./typedefs";

export interface Store {

    /**
     * Can be awaited on for the underlying store to be ready for operations.
     * Methods of the store should await on this, so if initialization fails then
     * no other method will work either.
     */
    readonly ready: Promise<void>;

    /**
     * Generates a ChainTracker describing how much of each chain this store has.
     *
     * Implicitly awaits on this.ready;
     */
    getChainTracker: () => Promise<ChainTracker>;

    /**
     * Returns a set of chains that may be appended to.
     * You'll need to getChainTracker to figure out the last
     * commit for any chain you want to add to though.
     *
     * Implicitly awaits on this.ready;
     */
    getClaimedChains: () => Promise<ClaimedChain[]>;

    /**
     * Mark a chain as being owned by this store.
     *
     * Implicitly awaits on this.ready;
     */
    claimChain: (medallion: Medallion, chainStart: ChainStart, actorId: ActorId) => Promise<ClaimedChain>;

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
     * Implicitly awaits on this.ready;
     */
    addBundle(bundleBytes: Bytes): Promise<BundleInfo>;

    /**
     * Get all commits from a store ordered by [timestamp, medallion].
     * Intended to be used to send to a peer.
     *
     * The callback should *NOT* await on anything (will cause problems
     * with the IndexedDb implementation if you do).
     * See https://github.com/google/gink/issues/28
     *
     * Implicitly awaits on this.ready;
     */
    getCommits: (callback: (commitBytes: Bytes, commitInfo: BundleInfo) => void) => Promise<void>;

    /**
     * Gets the protobuf bytes corresponding to a particular container's address.
     */
    // TODO maybe return an actual data structure ?
    getContainerBytes: (address: Muid) => Promise<Bytes | undefined>;

    // Returns the entries pointing to a particular container/node.
    getBackRefs(pointingTo: Muid): Promise<Entry[]>;

    getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined>;
    getEntryByKey(container: Muid, key?: KeyType | Muid | [Muid | Container, Muid | Container], asOf?: AsOf): Promise<Entry | undefined>;
    getKeyedEntries(source: Muid, asOf?: AsOf): Promise<Map<KeyType, Entry>>;
    getOrderedEntries(source: Muid, through: number, asOf?: AsOf): Promise<Entry[]>;
    getEntriesBySourceOrTarget(vertex: Muid, source: boolean, asOf?: AsOf): Promise<Entry[]>;

    /**
     * Closes the underlying data store.  Implicitly awaits on the `this.ready` promise.
     */
    close: () => Promise<void>;
}
