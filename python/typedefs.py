""" Various types classes for use throughout the codebase. """
from typing import NewType, Union
from struct import unpack

Medallion = NewType('Medallion', int)
MuTimestamp = int
Offset = NewType('Offset', int)
AsOf = Union[MuTimestamp, float, None]
UserKey = Union[str, int]
EPOCH = 0