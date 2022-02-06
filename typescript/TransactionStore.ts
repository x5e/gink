import {Carrier} from "./Carrier";

export interface TransactionStore {
    add(carrier: Carrier): void

}