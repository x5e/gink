""" Various types classes for use throughout the codebase. """
from typing import NewType, Union, TypeVar, Callable
from datetime import datetime, timedelta, date
from pathlib import Path


Medallion = int
MuTimestamp = int
Offset = NewType('Offset', int)
GenericTimestamp = Union[datetime, timedelta, date, int, float, str, None]
Destination = GenericTimestamp
UserKey = Union[str, int, bytes]
UserValue = Union[str, int, float, datetime, bytes, bool, None, dict, tuple, list]
EPOCH = 0
Limit = Union[int, float]
T = TypeVar('T')
inf = float("inf")


class Deletion:  # pylint: disable=too-few-public-methods
    """ Used internally to indicate that a key/value assocation has been removed. """


class Inclusion:
    """ Used to indicate adding something to a set or group. """


AuthFunc = Callable[[str, Path], int]

AUTH_NONE = 0
AUTH_READ = 1
AUTH_RITE = 2
AUTH_MAKE = 4
AUTH_FULL = 7

TIMESTAMP_HEX_DIGITS = 13
MEDALLION_HEX_DIGITS = 11
OFFSET_HEX_DIGITS = 8

TIMESTAMP_MOD = 16**TIMESTAMP_HEX_DIGITS
MEDALLION_MOD = 16**MEDALLION_HEX_DIGITS
OFFSET_MOD = 16**OFFSET_HEX_DIGITS

MAX_OFFSET = (OFFSET_MOD >> 1) - 1
MIN_OFFSET = -1 * (OFFSET_MOD >> 1)
