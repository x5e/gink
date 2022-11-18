""" Various types and NamedTuple classes for use throughout the codebase. """
from typing import NamedTuple, NewType

Medallion = NewType('Medallion', int)
MuTimestamp = NewType('MuTimestamp', int)
ChainStart = NewType('ChainStart', MuTimestamp)
Offset = NewType('Offset', int)


class Chain(NamedTuple):
    """ Pair of numbers to identify a block-chain in gink. """
    medallion: Medallion
    chain_start: ChainStart

class Muid(NamedTuple):
    """ The global address of a particular change. """
    timestamp: MuTimestamp
    medallion: Medallion
    offset: Offset
