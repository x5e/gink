""" Contains the Attribution class. """
from datetime import datetime, timezone
from .typedefs import MuTimestamp, Medallion


class Attribution:
    """ An object that encapsulates everything about who's responsible for a bundle. """
    __slots__ = [
        "timestamp",
        "medallion",
        "username",
        "hostname",
        "fullname",
        "email",
        "software",
        "comment",
    ]

    def __init__(self, timestamp: MuTimestamp, medallion: Medallion, *,
                 username=None,
                 hostname=None,
                 comment=None,
                 fullname=None,
                 software=None,
                 email=None,
                 ):
        self.timestamp = timestamp
        self.medallion = medallion
        self.username = username
        self.hostname = hostname
        self.comment = comment
        self.fullname = fullname
        self.software = software
        self.email = email

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

        returning = ""
        returning += f"{as_datetime} "
        if self.email:
            returning += self.email + " "
        elif self.username and self.hostname:
            host = self.hostname.split(".")[0]
            returning += f"{self.username}@{host}"
        elif self.fullname:
            returning += self.fullname
        if self.comment:
            returning += " "
            returning += self.comment
        return returning
