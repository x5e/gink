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
                result += f"{key}={getattr(self, key)!r},"
        result += ")"
        return result

    def __format__(self, format_spec: str) -> str:
        muid = Muid(self.timestamp, self.medallion, 0)
        short = str(muid)[0:28]
        as_datetime = datetime.fromtimestamp(self.timestamp / 1e6)
        if format_spec == "full":
            return f"{short}  {as_datetime}  {self.identity}  {self.abstract}"
        if format_spec == "brief":
            return f"{as_datetime}   {self.abstract}"
