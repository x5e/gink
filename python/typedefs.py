""" Various types classes for use throughout the codebase. """
from typing import NewType, Union

Medallion = NewType('Medallion', int)
MuTimestamp = Union[int, float]
Offset = NewType('Offset', int)
AsOf = Union[MuTimestamp, None]
UserKey = Union[str, int]
EPOCH = 0
INF = float("inf")
ZERO_64 = b"\x00" * 8