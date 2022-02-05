interface Carrier<MsgType> {
    parsed: MsgType;
    raw: Uint8Array;
}

interface TransactionStore {

}