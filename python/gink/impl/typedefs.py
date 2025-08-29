""" Various types classes for use throughout the codebase. """
from typing import (
    NewType,
    Union,
    TypeVar,
    Callable,
    Protocol,
    Optional,
    List,
    Tuple,
    Dict,
    Iterable,
    Any,
    Type,
)
from collections.abc import Mapping
from datetime import datetime, timedelta, date
from abc import ABC, abstractmethod

from .builders import SyncMessage


Medallion = int
MuTimestamp = int
Offset = NewType('Offset', int)
GenericTimestamp = Union[datetime, timedelta, date, int, float, str, None]
Destination = GenericTimestamp
UserKey = Union[str, int, bytes]
UserValue = Union[str, int, float, datetime, bytes, bool, None, dict, tuple, list]
EPOCH = 0
Limit = Union[MuTimestamp, float]
T = TypeVar('T')
inf = float("inf")


ExcInfo = Tuple[Type[BaseException], BaseException, Any]
StartResponse = Callable[[str, List[Tuple[str, str]], Optional[ExcInfo]], None]
WsgiFunc = Callable[[Dict[str, Any], StartResponse], Iterable[bytes]]

class Deletion:  # pylint: disable=too-few-public-methods
    """ Used internally to indicate that a key/value assocation has been removed. """


class Inclusion:
    """ Used to indicate adding something to a set or group. """


class Request(Protocol):

    @property
    def path(self) -> str:
        raise NotImplementedError()

    @property
    def headers(self) -> Mapping[str, str]:
        raise NotImplementedError()

    @property
    def cookies(self) -> Mapping[str, str]:
        raise NotImplementedError()



AuthFunc = Callable[[Request], int]

AUTH_NONE = 0
AUTH_READ = 1
AUTH_RITE = 2
AUTH_MAKE = 4
AUTH_FULL = 7


class Finished(BaseException):
    """ Thrown when FileObj should be removed from selectable set and closed.

        The interface in selectors requires removal before the file/connection is closed,
        so I'm using throwing this exception to indicate that that should happen.
    """
    pass


class Selectable(ABC):

    @abstractmethod
    def fileno(self) -> int:
        """ Return the underlying filehandle """

    @abstractmethod
    def close(self):
        """ Close the file object """

    @abstractmethod
    def on_ready(self) -> Optional[Iterable['Selectable']]:
        """ What to call when selected """

    @abstractmethod
    def is_closed(self) -> bool:
        """ Return true if this object has been closed """


ConnFunc = Callable[[Any], SyncMessage]

WbscFunc = Callable[[Any], None]

TIMESTAMP_HEX_DIGITS = 13
MEDALLION_HEX_DIGITS = 11
OFFSET_HEX_DIGITS = 8

TIMESTAMP_MOD = 16**TIMESTAMP_HEX_DIGITS
MEDALLION_MOD = 16**MEDALLION_HEX_DIGITS
OFFSET_MOD = 16**OFFSET_HEX_DIGITS

MAX_OFFSET = (OFFSET_MOD >> 1) - 1
MIN_OFFSET = -1 * (OFFSET_MOD >> 1)
