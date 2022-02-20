export type GreetingBytes = Uint8Array;
export type GinkTrxnBytes = Uint8Array;
export type Medallion = number;
export type Timestamp = number;
export type ChainStart = Timestamp;
export type SeenThrough = Timestamp;
export type HasMap = Map<Medallion,Map<ChainStart,SeenThrough>>;