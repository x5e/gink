""" contains the Muid class (basically a way to represent global addresses) """

from typing import Union, Optional
from uuid import UUID

from .builders import MuidBuilder
from .dummy import Dummy
from .typedefs import (
    MuTimestamp, Medallion, OFFSET_MOD, TIMESTAMP_MOD, MEDALLION_MOD,
    OFFSET_HEX_DIGITS, MEDALLION_HEX_DIGITS, MAX_OFFSET, MIN_OFFSET, TIMESTAMP_HEX_DIGITS
)


class Muid:
    """Defines a global address of an object in the Gink system."""

    def __init__(
        self,
        timestamp: Optional[MuTimestamp] = None,
        medallion: Optional[Medallion] = None,
        offset: int = 0,
        *,
        bundler = None,
    ):
        if bundler is None and (timestamp is None or medallion is None):
            raise ValueError("need timestamp and medallion when not using bundle")
        self._timestamp = None
        if timestamp is not None:
            if timestamp >= TIMESTAMP_MOD or timestamp < -1:
                raise ValueError(f"{timestamp=} out of range")
            self._timestamp = -1 if timestamp == TIMESTAMP_MOD - 1 else timestamp
        self._medallion = None
        if medallion is not None:
            if medallion >= MEDALLION_MOD or medallion < -1:
                raise ValueError(f"{medallion=} out of range")
            self._medallion = -1 if medallion == MEDALLION_MOD - 1 else medallion
        if offset >= OFFSET_MOD or offset <= -OFFSET_MOD:
            raise ValueError(f"{offset=} out of range")
        self.offset = offset if offset < (OFFSET_MOD >> 1) else offset - OFFSET_MOD
        self._bundler = bundler

    @property
    def timestamp(self) -> Optional[MuTimestamp]:
        if self._timestamp is not None:
            return self._timestamp
        if self._bundler:
            return self._bundler.timestamp
        raise ValueError("timestamp not defined?")

    @property
    def medallion(self) -> Optional[Medallion]:
        if self._medallion is not None:
            return self._medallion
        if self._bundler:
            return self._bundler.medallion
        raise ValueError("medallion not defined")

    def __lt__(self, othr):
        if not isinstance(othr, Muid):
            raise ValueError(f"can't compare a muid to a {othr}")
        self_tuple = (self.timestamp % TIMESTAMP_MOD, self.medallion % MEDALLION_MOD, self.offset % OFFSET_MOD)
        othr_tuple = (othr.timestamp % TIMESTAMP_MOD, othr.medallion % MEDALLION_MOD, othr.offset % OFFSET_MOD)
        return self_tuple < othr_tuple

    def __hash__(self):
        return hash((self.offset, self.medallion, self.timestamp))

    def __eq__(self, other):
        if not isinstance(other, Muid):
            return False
        return ((self.offset, self.medallion, self.timestamp)  # type: ignore
                == (other.offset, other.medallion, other.timestamp))  # type: ignore

    def __ne__(self, other):
        return not self.__eq__(other)

    def __repr__(self):
        return f"Muid({self.timestamp}, {self.medallion}, {self.offset})"

    def __bytes__(self):
        # There's probably a better way to do this...
        return UUID(str(self)).bytes

    def __str__(self):
        """Translates to a format that looks like: 05D5EAC793E61F-1F8CB77AE1EAA-0000B

        See docs/muid.md for a description of the format."""
        time_part = hex(self.timestamp % TIMESTAMP_MOD)[2:].upper().zfill(TIMESTAMP_HEX_DIGITS)
        medallion_part = hex(self.medallion % MEDALLION_MOD)[2:].upper().zfill(MEDALLION_HEX_DIGITS)
        offset_part = hex(self.offset % OFFSET_MOD)[2:].upper().zfill(OFFSET_HEX_DIGITS)

        result = f"{time_part}-{medallion_part}-{offset_part}"

        assert len(result) == 34, (len(result), result)
        return result

    def put_into(self, builder: MuidBuilder):
        """Puts the data from this muid into the builder."""
        builder.offset = self.offset  # type: ignore
        builder.timestamp = self.timestamp if self.timestamp else 0  # type: ignore
        builder.medallion = self.medallion if self.medallion else 0  # type: ignore

    @classmethod
    def create(
        cls,
        context = None,
        builder: Union[MuidBuilder, Dummy] = Dummy(),
        offset: Optional[int] = None,
    ):
        """ Creates a muid.

            The context argument should be a BundleInfo,
            or a Muid if offset is negative.
        """
        timestamp = builder.timestamp or context.timestamp  # type: ignore
        medallion = builder.medallion or context.medallion  # type: ignore
        offset = (offset or builder.offset) or 0
        if offset < 0:
            if not isinstance(context, Muid):
                raise ValueError("invalid context for negative offset")
            offset = context.offset + offset
        assert isinstance(offset, int)
        assert medallion, "no medallion"
        assert timestamp, "no timestamp"
        return cls(timestamp, medallion, offset)

    @staticmethod
    def from_str(hexed: str):
        """ The inverse of str(muid) """
        if len(hexed.replace("-", "")) != 32:
            raise ValueError("doesn't look like a valid muid: %r" % hexed)
        parts = hexed.split("-")
        assert len(parts) == 3
        timestamp = int(parts[0], 16)
        medallion = int(parts[1], 16)
        offset = int(parts[2], 16)
        return Muid(timestamp, medallion, offset)

    @staticmethod
    def from_bytes(data: bytes):
        """ The inverse of bytes(muid) """
        # there's probably a more efficient way to do this
        if len(data) != 16:
            raise ValueError("expect a muid to be 16 bytes")
        total = int(data.hex(), 16)
        offset = total & (OFFSET_MOD - 1)
        total = total >> (OFFSET_HEX_DIGITS * 4)
        medallion = total & (MEDALLION_MOD - 1)
        timestamp = total >> (MEDALLION_HEX_DIGITS * 4)
        return Muid(timestamp, medallion, offset)
