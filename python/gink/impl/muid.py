""" contains the Muid class (basically a way to represent global addresses) """

from typing import Union, Optional
from uuid import UUID

from .builders import MuidBuilder
from .dummy import Dummy
from .typedefs import MuTimestamp, Medallion


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
        self._timestamp = timestamp
        self._medallion = medallion
        self.offset = offset
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

    def __lt__(self, other):
        return bytes(self) < bytes(other)

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
        timestamp_mod = 16**14
        medallion_mod = 16**13
        offset_mod = 16**5
        time_part = hex(self.timestamp % timestamp_mod)[2:].upper().zfill(14)
        medallion_part = hex(self.medallion % medallion_mod)[2:].upper().zfill(13)
        offset_part = hex(self.offset % offset_mod)[2:].upper().zfill(5)

        result = f"{time_part}-{medallion_part}-{offset_part}"

        assert len(result) == 34, len(result)
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
        offset = offset or builder.offset or 0
        if offset < 0:
            if not isinstance(context, Muid):
                raise ValueError("invalid context for negative offset")
            offset = context.offset + offset
        assert medallion, "no medallion"
        assert timestamp, "no timestamp"
        return cls(timestamp, medallion, offset)

    @staticmethod
    def from_str(hexed: str):
        """ The inverse of str(muid) """
        timestamp_mod = 16**14
        medallion_mod = 16**13
        offset_mod = 16**5
        hexed = hexed.replace("-", "")
        if len(hexed) != 32:
            raise ValueError("doesn't look like a valid muid: %r" % hexed)
        time_part = int(hexed[0:14], 16)
        medl_part = int(hexed[14:27], 16)
        off_part = int(hexed[27:32], 16)
        return Muid(
            timestamp=time_part - timestamp_mod * (time_part > (timestamp_mod >> 1)),
            medallion=medl_part - medallion_mod * (medl_part > (medallion_mod >> 1)),
            offset=off_part - offset_mod * (off_part > (offset_mod >> 1)),
        )

    @staticmethod
    def from_bytes(data: bytes):
        """ The inverse of bytes(muid) """
        # there's probably a more efficient way to do this
        if len(data) < 16:
            raise ValueError("can't parse less than 16 bytes into a muid")
        return Muid.from_str(data.hex())
