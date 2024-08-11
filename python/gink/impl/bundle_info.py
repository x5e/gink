#!/usr/bin/env python3
""" Contains the BundleInfo class. """
from typing import Optional
from struct import Struct

from .builders import SyncMessage, BundleBuilder
from .typedefs import Medallion, MuTimestamp
from .tuples import Chain


class BundleInfo:
    """ Metadata about a particular change set relevant for syncing. """
    _struct = Struct(">QQQQ")
    __slots__ = ["timestamp", "medallion", "chain_start", "previous", "hex_hash", "comment"]

    timestamp: MuTimestamp
    medallion: Medallion
    chain_start: MuTimestamp
    previous: MuTimestamp
    hex_hash: Optional[str]
    comment: Optional[str]

    def __init__(self, *, builder: Optional[BundleBuilder] = None, encoded: bytes = b'\x00' * 32, **kwargs):

        if len(encoded) < 32:
            raise ValueError("need at least 32 bytes to unpack")
        unpacked = self._struct.unpack(encoded[0:32])
        (self.timestamp, self.medallion, self.chain_start, self.previous) = unpacked
        self.hex_hash = encoded[32:64].hex() if len(encoded) > 32 else None
        self.comment = encoded[64:].decode() if len(encoded) > 64 else None

        if builder:
            self.medallion = builder.medallion  # type: ignore # pylint: disable=maybe-no-member
            self.timestamp = builder.timestamp  # type: ignore # pylint: disable=maybe-no-member
            self.chain_start = builder.chain_start  # type: ignore  # pylint: disable=maybe-no-member
            self.comment = builder.comment  # type: ignore # pylint: disable=maybe-no-member\
            self.previous = builder.previous  # type: ignore # pylint: disable=maybe-no-member
            assert "hex_hash" in kwargs

        if "chain" in kwargs:
            chain = kwargs["chain"]
            assert isinstance(chain, Chain)
            self.chain_start = chain.chain_start
            self.medallion = chain.medallion
        for key in self.__slots__:
            if key in kwargs:
                val = kwargs[key]
                setattr(self, key, val)

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
    def from_bytes(data: bytes) -> 'BundleInfo':
        """ the opposite of __bytes__ """
        if not (isinstance(data, bytes) and len(data) >= 32):
            raise ValueError("bad argument to BundleInfo.from_bytes: %r" % data)
        return BundleInfo(encoded=data)

    def get_chain(self) -> Chain:
        """Gets a Chain tuple saying which chain this change set came from."""
        return Chain(chain_start=self.chain_start, medallion=self.medallion)

    def __bytes__(self) -> bytes:
        """ Returns: a binary representation that sorts according to (timestamp, medallion)."""
        assert self.hex_hash is not None, "hex_hash is None!"
        num = self._struct.pack(self.timestamp, self.medallion, self.chain_start, self.previous)
        return num + bytes.fromhex(self.hex_hash) + (self.comment.encode() if self.comment else b"")

    def __lt__(self, other):
        assert isinstance(other, type(self))
        return self._essential_tuple() < other._essential_tuple()

    def __repr__(self) -> str:
        contents = [f"{x}={repr(getattr(self, x))}" for x in self.__slots__ if getattr(self, x)]
        joined = ", ".join(contents)
        return self.__class__.__name__ + '(' + joined + ')'

    def _essential_tuple(self) -> tuple:
        return (self.timestamp, self.medallion, self.chain_start)

    def __eq__(self, other):
        if not isinstance(other, type(self)):
            return False
        return self._essential_tuple() == other._essential_tuple()

    def __hash__(self):
        return hash(self._essential_tuple())
