""" a couple of NamedTuple definitions """
from typing import NamedTuple
from entry_pb2 import Entry as EntryBuilder
from muid import Muid
from typedefs import Medallion, MuTimestamp

class Chain(NamedTuple):
    """ Pair of numbers to identify a block-chain in gink. """
    medallion: Medallion
    chain_start: MuTimestamp

class EntryAddressAndBuilder(NamedTuple):
    """ Entry information returned by the store for keyed containers.

    The address is necessary because some muids in the proto may be relative.
    """
    address: Muid
    builder: EntryBuilder

class PositionedEntry(NamedTuple):
    position: MuTimestamp
    positioner: Muid
    entry_muid: Muid
    entry_data: EntryBuilder