""" Defines the Muid class. """
from typing import Optional as O, Any

class Muid:
    """ Defines a global address of an object in the Gink system. """
    __slots__ = ["_offset", "_medallion", "_timestamp", "_change_set"]

    def __init__(self, offset: int, medallion: O[int]=None, timestamp: O[int]=None, *,
            change_set: O[Any]=None):
        assert change_set or (medallion and timestamp)
        assert offset
        self._offset = offset
        self._medallion = medallion
        self._timestamp = timestamp
        self._change_set = change_set

    def __getattr__(self, name) -> int:
        if name == "offset":
            return self._offset
        if name == "timestamp":
            return self._timestamp or getattr(self._change_set, "timestamp")
        if name == "medallion":
            return self._medallion or getattr(self._change_set, "medallion")
        raise AttributeError("not known")
