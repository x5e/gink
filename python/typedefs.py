from typing import NamedTuple, NewType

Medallion = NewType('Medallion', int)
MuTimestamp = NewType('MuTimestamp', int)
ChainStart = NewType('ChainStart', MuTimestamp)
Offset = NewType('Offset', int)


class Chain(NamedTuple):
    medallion: Medallion
    chain_start: ChainStart

class Muid(NamedTuple):
    timestamp: MuTimestamp
    medallion: Medallion
    offset: Offset
