""" Defines the Muid class. """
from typing import Optional, Any, NamedTuple


class Muid(NamedTuple):
    """ Defines a global address of an object in the Gink system. """
    timestamp: Optional[int]
    medallion: Optional[int]
    offset: int


class Deferred(Muid):
    """ Version of a muid that references a changeset """


    def __init__(self, offset: int, change_set: Any):
        Muid.__init__(self, None, None, offset)
        self._change_set = change_set

    def __getattribute__(self, name) -> int:
        if name == "_change_set":
            return object.__getattribute__(self, "_change_set")
        if name == "offset":
            return Muid.__getattribute__(self, "offset")
        if name == "timestamp":
            return getattr(self._change_set, "timestamp")
        if name == "medallion":
            return getattr(self._change_set, "medallion")
        raise AttributeError("not known")

    def __hash__(self):
        return hash(tuple(self.offset, self.medallion, self.timestamp))  # type: ignore

    def __eq__(self, other):
        if not isinstance(other, Muid):
            return False
        return (tuple(self.offset, self.medallion, self.timestamp) # type: ignore
        == tuple(other.offset, other.medallion, other.timestamp)) # type: ignore
