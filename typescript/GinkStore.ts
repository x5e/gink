import {GreetingBytes, GinkTrxnBytes, HasMap} from "./typedefs"

export interface GinkStore {

    /**
     * Generates the greeting message that should be sent on a 
     * new connection between Gink peers.  It how much of each
     * chain the sender has, so the recepient will know what 
     * to send.
     */
    getGreeting: () => Promise<GreetingBytes>;

    /**
     * Tries to add a transaction to this store; returns truthy
     * if actually added, false if not (e.g. if already has it).
     * If adding to the store, will also update the HasMap.
     * Will throw if passed a transaction without the proceeding
     * ones in the associated change. 
     */
    addTransaction: (trxn: GinkTrxnBytes, hasMap?: HasMap) => Promise<boolean>;

    /**
     * Sends to the callback transactions that a peer needs
     * as evidenced by the greeting (or all if greeting is null).
     * The transactions are sent to the callback ordered by time.
     * The partialOkay flag is only relevant when this store has
     * dumped history after a checkpoint and doesn't have the full
     * history for all chains.  The default (false) will barf if
     * the remote node hasn't seen a chain and this node doesn't 
     * have the start of it.
     */
    getNeededTransactions: (
        callback: (x: GinkTrxnBytes) => void, 
        greeting?: GreetingBytes) => Promise<HasMap>;

    close: () => Promise<void>;
}