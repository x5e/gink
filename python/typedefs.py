""" Various types classes for use throughout the codebase. """
from typing import NewType, Union

Medallion = NewType('Medallion', int)
MuTimestamp = NewType('MuTimestamp', int)
Offset = NewType('Offset', int)
AsOf = Union[MuTimestamp, None]
Key = Union[str, int]
EPOCH = MuTimestamp(0)
