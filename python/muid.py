from typing import Optional as O

class Muid:
    __slots__ = ["_offset", "_medallion", "_timestamp", "_change_set"]

    def __init__(self, offset: int, medallion: O[int]=None, timestamp: O[int]=None, *, change_set=None):
        assert change_set or (medallion and timestamp)
        assert offset
        self._offset = offset
        self._medallion = medallion
        self._timestamp = timestamp
        self._change_set = change_set

    def __getattr__(self, name):
        if name == "offset":
            return self._offset
        if name == "timestamp":
            return self._timestamp or self._change_set.timestamp
        if name == "medallion":
            return self._medallion or self._change_set.medallion