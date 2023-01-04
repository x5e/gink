#!/usr/bin/env python3
""" Contains the ChangeSetInfo class. """
from typing import Optional
from struct import Struct
from ..builders.bundle_pb2 import Bundle
from .typedefs import Medallion, MuTimestamp
from .tuples import Chain

class BundleInfo:
    """ Metadata about a particular change set relevant for syncing. """
    _struct = Struct(">QQQQ")
    __slots__ = ["timestamp", "medallion", "chain_start", "previous", "comment"]

    timestamp: MuTimestamp
    medallion: Medallion
    chain_start: MuTimestamp
    previous: MuTimestamp
    comment: str

    def __init__(self, *, builder: Optional[Bundle]=None, encoded: bytes=b'\x00'*32, **kwargs):

        unpacked = self._struct.unpack(encoded[0:32])
        (self.timestamp, self.medallion, self.chain_start, self.previous) = unpacked
        self.comment = encoded[32:].decode()

        if builder:
            self.medallion = builder.medallion  # type: ignore # pylint: disable=maybe-no-member
            self.timestamp = builder.timestamp # type: ignore # pylint: disable=maybe-no-member
            self.chain_start = builder.chain_start  # type: ignore  # pylint: disable=maybe-no-member
            self.comment = builder.comment  # type: ignore # pylint: disable=maybe-no-member\
            self.previous = builder.previous  # type: ignore # pylint: disable=maybe-no-member

        if "chain" in kwargs:
            chain = kwargs["chain"]
            assert isinstance(chain, Chain)
            self.chain_start = chain.chain_start
            self.medallion = chain.medallion
        for key in self.__slots__:
            if key in kwargs:
                setattr(self, key, kwargs[key])
    
    @staticmethod
    def from_bytes(data: bytes):
        assert isinstance(data, bytes) and len(data) >= 32, (type(data), data)
        return BundleInfo(encoded=data)

    def get_chain(self) -> Chain:
        """Gets a Chain tuple saying which chain this change set came from."""
        return Chain(self.medallion, self.chain_start)

    def __bytes__(self) -> bytes:
        """ Returns: a binary representation that sorts according to (timestamp, medallion)."""
        num = self._struct.pack(self.timestamp, self.medallion, self.chain_start, self.previous)
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
