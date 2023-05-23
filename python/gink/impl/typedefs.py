""" Various types classes for use throughout the codebase. """
from typing import NewType, Union
from datetime import datetime, timedelta, date

Medallion = int
MuTimestamp = int
Offset = NewType('Offset', int)
GenericTimestamp = Union[datetime, timedelta, date, int, float, str, None]
Destination = GenericTimestamp
UserKey = Union[str, int, bytes]
UserValue = Union[str, int, float, datetime, bytes, bool, list, tuple, dict, None]
EPOCH = 0


class Deletion: # pylint: disable=too-few-public-methods
    """ Used internally to indicate that a key/value assocation has been removed. """

class Inclusion:
    """ Used to indicate adding something to a set or role. """
