""" Contains the Attribution class. """
from datetime import datetime
from .typedefs import MuTimestamp, Medallion
from typing import Optional
from .muid import Muid


class Attribution:
    """ An object that encapsulates everything about who's responsible for a bundle. """
    __slots__ = [
        "timestamp",
        "medallion",
        "identity",
        "abstract",
    ]

    def __init__(self,
                 timestamp: MuTimestamp,
                 medallion: Medallion,
                 identity: str,
                 abstract: Optional[str],
                 ):
        self.timestamp = timestamp
        self.medallion = medallion
        self.identity = identity
        self.abstract = abstract

    def __repr__(self):
        result = "Attribution("
        for key in self.__slots__:
            if hasattr(self, key) and getattr(self, key):
                result += f"{key}={getattr(self, key)!r},"
        result += ")"
        return result

    def __str__(self):
        return format(self, "%O-%Q  %FT%T.%f  %i  %v")

    def __format__(self, format_spec: str) -> str:
        """ Translate given the format spec:

            %i -- identity
            %v -- comment / summary
            %o -- timestamp as integer
            %O -- timestamp as HEX
            %q -- medallion as integer
            %Q -- medallion as HEX

        """

        muid = Muid(self.timestamp, self.medallion, 0)
        short = str(muid)[0:28]
        timestamp_as_hex = short[0:14]
        medallion_as_hex = short[15:]
        as_datetime = datetime.fromtimestamp(self.timestamp / 1e6)
        partial = format(as_datetime, format_spec)
        partial = partial.replace("%i", self.identity)
        partial = partial.replace("%v", self.abstract or "<missing bundle>")
        partial = partial.replace("%o", str(self.timestamp))
        partial = partial.replace("%O", timestamp_as_hex)
        partial = partial.replace("%q", str(self.medallion))
        partial = partial.replace("%Q", medallion_as_hex)
        return partial
