#!/usr/bin/env python3
""" Contains the BundleInfo class. """
from __future__ import annotations
from typing import Optional
from struct import Struct

from .builders import SyncMessage, HeaderBuilder
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

    def __init__(self, *, builder: Optional[HeaderBuilder] = None, encoded: bytes = b'\x00' * 32, **kwargs):

        if len(encoded) < 32:
            raise ValueError("need at least 32 bytes to unpack")
        unpacked = self._struct.unpack(encoded[0:32])
        (self.timestamp, self.medallion, self.chain_start, self.previous) = unpacked
        self.comment = encoded[32:].decode()

        if builder:
            self.medallion = builder.medallion  # type: ignore # pylint: disable=maybe-no-member
            self.timestamp = builder.timestamp  # type: ignore # pylint: disable=maybe-no-member
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

    def as_acknowledgement(self) -> SyncMessage:
        """ convert to an ack message that can be sent to a peer """
        sync_message = SyncMessage()
        ack = getattr(sync_message, "ack")  # type: ignore
        ack.medallion = self.medallion
        ack.chain_start = self.chain_start
        ack.timestamp = self.timestamp
        ack.previous = self.previous
        return sync_message

    @staticmethod
    def from_ack(sync_message: SyncMessage):
        """ reverse of as_ack """
        assert sync_message.HasField("ack")
        ack = sync_message.ack  # type: ignore
        return BundleInfo(
            chain_start=ack.chain_start,
            medallion=ack.medallion,
            timestamp=ack.timestamp,
            previous=ack.previous,
        )

    @staticmethod
    def from_bytes(data: bytes) -> BundleInfo:
        """ the opposite of __bytes__ """
        if not (isinstance(data, bytes) and len(data) >= 32):
            raise ValueError("bad argument to BundleInfo.from_bytes: %r" % data)
        return BundleInfo(encoded=data)

    def get_chain(self) -> Chain:
        """Gets a Chain tuple saying which chain this change set came from."""
        return Chain(chain_start=self.chain_start, medallion=self.medallion)

    def __bytes__(self) -> bytes:
        """ Returns: a binary representation that sorts according to (timestamp, medallion)."""
        num = self._struct.pack(self.timestamp, self.medallion, self.chain_start, self.previous)
        return num + self.comment.encode()

    def __lt__(self, other):
        return (self.timestamp < other.timestamp or (
                self.timestamp == other.timestamp and self.medallion < other.medallion))

    def __repr__(self) -> str:
        contents = [f"{x}={repr(getattr(self, x))}" for x in self.__slots__ if getattr(self, x)]
        joined = ", ".join(contents)
        return self.__class__.__name__ + '(' + joined + ')'

    def __eq__(self, other):
        return bytes(self) == bytes(other)

    def __hash__(self):
        return hash(bytes(self))
