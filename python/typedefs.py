""" Various types and NamedTuple classes for use throughout the codebase. """
from typing import NamedTuple, NewType

Medallion = NewType('Medallion', int)
MuTimestamp = NewType('MuTimestamp', int)
Offset = NewType('Offset', int)


class Chain(NamedTuple):
    """ Pair of numbers to identify a block-chain in gink. """
    medallion: Medallion
    chain_start: MuTimestamp

class Muid(NamedTuple):
    """ The global address of a particular change. """
    timestamp: MuTimestamp
    medallion: Medallion
    offset: Offset
