""" the ChangeSet class """
from typing import Optional, Union, Any
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_pb2 import Change as ChangeBuilder
from muid import Muid, Deferred
from change_set_info import ChangeSetInfo

class ChangeSet:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str]=None):
        self._sealed: Union[bool, bytes] = False
        self._change_set_builder = ChangeSetBuilder()
        self._count_items = 0
        self._medallion: Optional[int] = None
        self._timestamp: Optional[int] = None
        self._comment = comment

    def __setattr__(self, __name: str, __value: Any) -> None:
        if hasattr(self, "_sealed"):
            assert not self._sealed, "can't change a sealed change set"
        if __name == "comment":
            self._comment = __value
            return
        object.__setattr__(self, __name, __value)

    def __getattr__(self, name):
        if name == "medallion":
            return self._medallion
        if name == "timestamp":
            return self._timestamp
        if name == "comment":
            return self._comment
        if name == "sealed":
            return self._sealed
        return object.__getattribute__(self, name)

    def add_change(self, change_builder: ChangeBuilder) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = Deferred(offset=self._count_items, change_set=self)
        self._change_set_builder.changes[self._count_items] = change_builder  # type: ignore # pylint: disable=maybe-no-member
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
        self._sealed = self._change_set_builder.SerializeToString() # type: ignore # pylint: disable=maybe-no-member
        return self._sealed
