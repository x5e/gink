#!/usr/bin/env python3
""" Contains the ChangeSetInfo class. """
from typing import Optional
from struct import Struct
from change_set_pb2 import ChangeSet
from .typedefs import Medallion, MuTimestamp
from .tuples import Chain

class ChangeSetInfo:
    """Metadata about a particular change set relevant for syncing."""
    _struct = Struct(">QQQQ")
    __slots__ = ["timestamp", "medallion", "chain_start", "prior_time", "comment"]
    medallion: Medallion
    timestamp: MuTimestamp
    chain_start: MuTimestamp
    prior_time: MuTimestamp
    comment: str

    def __init__(self, *, builder: Optional[ChangeSet]=None, encoded: bytes=b'\x00'*32, **kwargs):

        unpacked = self._struct.unpack(encoded[0:32])
        (self.timestamp, self.medallion, self.chain_start, self.prior_time) = unpacked
        self.comment = encoded[32:].decode()


        if builder:
            self.medallion = builder.medallion  # type: ignore # pylint: disable=maybe-no-member
            self.timestamp = builder.timestamp # type: ignore # pylint: disable=maybe-no-member
            self.chain_start = builder.chain_start  # type: ignore  # pylint: disable=maybe-no-member
            self.comment = builder.comment  # type: ignore # pylint: disable=maybe-no-member\
            self.prior_time = builder.previous_timestamp  # type: ignore # pylint: disable=maybe-no-member

        if "chain" in kwargs:
            chain = kwargs["chain"]
            assert isinstance(chain, Chain)
            self.chain_start = chain.chain_start
            self.medallion = chain.medallion
        for key in self.__slots__:
            if key in kwargs:
                setattr(self, key, kwargs[key])

        if not (isinstance(self.medallion, int) and self.medallion > 0):
            raise ValueError(f'medallion({self.medallion}) is invalid')
        if not (isinstance(self.timestamp, int) and self.timestamp > 0):
            raise ValueError(f'timestamp({self.timestamp}) is invalid')
        if not (isinstance(self.chain_start, int) and self.chain_start > 0):
            raise ValueError(f'chain_start({self.chain_start}) is invalid')
        if self.timestamp < self.chain_start:
            raise ValueError("timestamp before chain start")

    def get_chain(self) -> Chain:
        """Gets a Chain tuple saying which chain this change set came from."""
        return Chain(self.medallion, self.chain_start)


    def __bytes__(self) -> bytes:
        """ Returns: a binary representation that sorts according to (timestamp, medallion)."""
        num = self._struct.pack(self.timestamp, self.medallion, self.chain_start, self.prior_time)
        return num + self.comment.encode()

    def __lt__(self, other):
        return (self.timestamp < other.timestamp or (
            self.timestamp == other.timestamp and self.medallion < other.medallion))

    def __repr__(self) -> str:
        contents = [f"{x}={repr(getattr(self,x))}" for x in self.__slots__ if getattr(self,x)]
        contents = ", ".join(contents)
        return self.__class__.__name__ + '(' + contents + ')'

    def __eq__(self, other):
        return bytes(self) == bytes(other)

    def __hash__(self):
        return hash(bytes(self))
