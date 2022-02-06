// import { Message } from "messages_pb";
// import { Transaction } from "transactions_pb";


export interface Carrier {
    timestamp: number;
    medallion: number;
    started: number;
    previous?: number;
    bytes: Uint8Array;
}

// function messageToCarrier(transaction: Transaction): Carrier { }