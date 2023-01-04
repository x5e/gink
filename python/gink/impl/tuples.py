""" a couple of NamedTuple definitions, primarily for internal usage """
from typing import NamedTuple
from datetime import datetime
from ..builders.entry_pb2 import Entry as EntryBuilder

from .muid import Muid
from .typedefs import Medallion, MuTimestamp

class Chain(NamedTuple):
    """ Pair of numbers to identify a block-chain in gink. """
    medallion: Medallion
    chain_start: MuTimestamp

class FoundEntry(NamedTuple):
    """ Entry information returned by the store for keyed containers.

    The address is necessary because some muids in the proto may be relative.
    """
    address: Muid
    builder: EntryBuilder

class PositionedEntry(NamedTuple):
    position: MuTimestamp
    positioner: Muid
    entry_muid: Muid
    builder: EntryBuilder

class SequenceKey(NamedTuple):
    position: MuTimestamp
    entry_muid: Muid

class Blame(NamedTuple):
    username: str
    hostname: str
    datetime: datetime
    def __str__(self):
        return f"{self.username} {self.datetime} {self.hostname}"