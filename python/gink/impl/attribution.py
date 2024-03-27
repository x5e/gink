""" Contains the Attribution class. """
from datetime import datetime, timezone
from .typedefs import MuTimestamp, Medallion
from typing import Optional


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
                 abstract: Optional[str]=None,
                 ):
        self.timestamp = timestamp
        self.medallion = medallion
        self.identity = identity
        self.abstract = abstract

    def __repr__(self):
        result = "Attribution("
        for key in self.__slots__:
            if hasattr(self, key) and getattr(self, key):
                result += f"\n\t{key}={getattr(self, key)!r},"
        result += ")\n"
        return result

    def __str__(self):
        local_timezone = datetime.now(timezone.utc).astimezone().tzinfo
        as_datetime = datetime.fromtimestamp(self.timestamp / 1e6, local_timezone)
        as_datetime = as_datetime.replace(microsecond=0)
        returning = ""
        returning += hex(self.medallion)[2:] + f" {as_datetime}"
        returning += "%30s" % self.identity
        if self.abstract:
            returning += "   "
            returning += repr(self.abstract)
        return returning
