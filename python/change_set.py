""" the ChangeSet class """
from typing import Optional, Union, Any

from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_pb2 import Change as ChangeBuilder
from entry_pb2 import Entry as EntryBuilder

from change_set_info import ChangeSetInfo
from muid import Muid

class ChangeSet:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str]=None):
        self._sealed: Union[bool, bytes] = False
        self._change_set_builder = ChangeSetBuilder()
        self._count_items = 0
        self._comment = comment
        self._info: Optional[ChangeSetInfo] = None

    def __len__(self):
        return self._count_items

    def __setattr__(self, __name: str, __value: Any) -> None:
        if hasattr(self, "_sealed") and self._sealed:
            raise AttributeError("can't change a sealed change set")
        if __name == "comment":
            self._comment = __value
            return
        object.__setattr__(self, __name, __value)

    def __getattr__(self, name):
        if name == "medallion":
            return self._info.medallion if self._info else None
        if name == "timestamp":
            return self._info.timestamp if self._info else None
        if name == "comment":
            return self._comment
        if name == "sealed":
            return self._sealed
        return object.__getattribute__(self, name)

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = self.Deferred(offset=self._count_items, change_set=self)
        if isinstance(builder, EntryBuilder):
            entry_builder = builder
            builder = ChangeBuilder()
            builder.entry.CopyFrom(entry_builder) # type: ignore # pylint: disable=maybe-no-member
        assert isinstance(builder, ChangeBuilder)
        changes = self._change_set_builder.changes # type: ignore # pylint: disable=maybe-no-member
        changes[self._count_items].ignored = True # have to do this because can't call __setitem__
        changes[self._count_items].CopyFrom(builder) # type: ignore
        return muid

    def seal(self, change_set_info: ChangeSetInfo) -> bytes:
        """ Finalizes a change set and serializes it. """
        self._change_set_builder.chain_start = change_set_info.chain_start # type: ignore # pylint: disable=maybe-no-member
        self._change_set_builder.medallion = change_set_info.medallion # type: ignore # pylint: disable=maybe-no-member
        self._change_set_builder.timestamp = change_set_info.timestamp # type: ignore # pylint: disable=maybe-no-member
        if change_set_info.prior_time:
            self._change_set_builder.previous_timestamp = change_set_info.prior_time # type: ignore # pylint: disable=maybe-no-member
        if self._comment:
            self._change_set_builder.comment = self.comment # type: ignore # pylint: disable=maybe-no-member
        self._info = change_set_info
        self._sealed = self._change_set_builder.SerializeToString() # type: ignore # pylint: disable=maybe-no-member
        return self._sealed

    class Deferred(Muid):
        """ Version of a muid that references a changeset """

        def __new__(cls, offset: int, change_set: Any):
            assert change_set is not None
            return Muid.__new__(cls, None, None, offset)

        def __init__(self, offset: int, change_set: Any):
            if not offset:
                Muid.__init__(self, 0, 0, offset)
            assert offset
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
