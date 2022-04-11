export type GreetingBytes = Uint8Array;
export type CommitBytes = Uint8Array;
export type Medallion = number;
export type Timestamp = number;
export type ChainStart = Timestamp;
export type SeenThrough = Timestamp;
export type HasMap = Map<Medallion,Map<ChainStart,SeenThrough>>;
export type PriorTime = Timestamp;
export type ClaimedChains = Map<Medallion, ChainStart>;
export type Offset = number;

// [Timestamp, Medallion] should enough to uniquely specify a Commit.
// ChainStart and PriorTime are just included here to avoid re-parsing.
export type CommitInfo = [Timestamp, Medallion, ChainStart, PriorTime];