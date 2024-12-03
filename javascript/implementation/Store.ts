import { ChainTracker } from "./ChainTracker";
import {
    Medallion,
    ChainStart,
    Muid,
    Bytes,
    ScalarKey,
    Entry,
    AsOf,
    BundleView,
    BroadcastFunc,
    KeyPair,
    Value,
    Placement,
    MuidTuple,
    BundleInfo,
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


    acquireChain: (identity: string) => Promise<BundleInfo|null>;

    /**
     * Attempts to get the identity of the user who started the chain.
     * @param chainInfo [Medallion, ChainStart]
     * @returns a string of the identity of the user who started the chain.
     */
    getChainIdentity: (chainInfo: [Medallion, ChainStart]) => Promise<string>;

    /** Attempt to get the verify key for a particular chain (stored with the first bundle).
     *
     */
    getVerifyKey: (chainInfo: [Medallion, ChainStart]) => Promise<Bytes>;

    /**
     * Tries to add a bundle to this store; returns truthy
     * if actually added, false if not (e.g. if already has it).
     * Will throw if passed a bundle without the proceeding
     * ones in the associated chain.
     *
     * Optionally can reuse/start a new chain.
     *
     * Implicitly awaits on this.ready;
     */
    addBundle(bundle: BundleView, claimChain?: boolean): Promise<Boolean>;

    /**
     * Get all bundles from a store ordered by [timestamp, medallion].
     * Intended to be used to send to a peer.
     *
     * The callback should *NOT* await on anything (will cause problems
     * with the IndexedDb implementation if you do).
     * See https://github.com/google/gink/issues/28
     *
     * Implicitly awaits on this.ready;
     */
    getBundles: (callback: (bundle: BundleView) => void) => Promise<void>;

    /**
     * Gets the protobuf bytes corresponding to a particular container's address.
     */
    // TODO maybe return an actual data structure ?
    getContainerBytes: (address: Muid) => Promise<Bytes | undefined>;

    /**
     * In ordered container types (Sequence and EdgeType), entries may be moved around.
     * This method returns information about the current effective time, which may
     * be different from the timestamp of the entry itself.
     * @param entry the muid of the entry
     * @param asOf optional timestamp to look back to
     * @returns an object with the container muid, key, and the placement id.
     */
    getLocation: (entry: Muid, asOf?: AsOf) => Promise<Placement | undefined>;

    getEntryById(entryMuid: Muid, asOf?: AsOf): Promise<Entry | undefined>;

    getEntryByKey(
        container: Muid,
        key?: ScalarKey | Muid | [Muid, Muid],
        asOf?: AsOf
    ): Promise<Entry | undefined>;

    getKeyedEntries(source: Muid, asOf?: AsOf): Promise<Map<string, Entry>>;

    /**
     * returns a map where the entries were inserted in the desired order, and the keys
     * correspond to <effectiveTs>,<placementIdStr>.
     */
    getOrderedEntries(
        source: Muid,
        through: number,
        asOf?: AsOf
    ): Promise<Map<string, Entry>>;

    getEntriesBySourceOrTarget(
        vertex: Muid,
        source: boolean,
        asOf?: AsOf
    ): Promise<Entry[]>;

    /**
     * Returns an Array of all containers matching the provided name.
     * Names are set using the global property.
     * @param name
     * @param asOf optional timestamp to look back to
     */
    getContainersByName(name: string, asOf?: AsOf): Promise<Array<Muid>>;

    /**
     * Get the properties corresponding to a container.
     * @param containerMuid the Muid of the container to get the properties of
     * @param asOf optional timestamp to look back to
     * @returns a Map of string Muid (of the Property Container) to Value
     */
    getContainerProperties(
        containerMuid: Muid,
        asOf?: AsOf
    ): Promise<Map<string, Value>>;

    /**
     * Get every container in the store.
     */
    getAllContainerTuples(): Promise<MuidTuple[]>;

    /**
     * Adds a callback to be called when a bundle was added by a
     * different store and is found by the current store.
     * Primarily intended for use with the LogBackedStore and file sharing.
     * @param callback the function to be called when a new bundle is found.
     * It needs to take two arguments, bundleBytes and bundleInfo.
     */
    addFoundBundleCallBack(callback: BroadcastFunc): void;

    /**
     * Closes the underlying data store.  Implicitly awaits on the `this.ready` promise.
     */
    close: () => Promise<void>;

    saveKeyPair(keyPair: KeyPair): Promise<void>;

    pullKeyPair(publicKey: Bytes): Promise<KeyPair>;

    /**
     * Saves a symmetric key for future use.
     * Returns the keyId (a 52 bit digest of the key).
     * @param symmetricKey the symmetric key to store
     */
    saveSymmetricKey(symmetricKey: Bytes): Promise<number>;

    /**
     * Retrieves a previously stored symmetric key.
     * @param keyId the id of the symmetric key to retrieve
     */
    getSymmetricKey(keyId: Number): Promise<Bytes>;
}
