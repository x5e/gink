""" a couple of NamedTuple definitions """
from typing import NamedTuple
from entry_pb2 import Entry as EntryBuilder
from muid import Muid
from typedefs import Medallion, MuTimestamp

class Chain(NamedTuple):
    """ Pair of numbers to identify a block-chain in gink. """
    medallion: Medallion
    chain_start: MuTimestamp

class EntryPair(NamedTuple):
    """ Result of a successful seek. """
    address: Muid
    builder: EntryBuilder
