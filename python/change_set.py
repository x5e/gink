""" the ChangeSet class """
from typing import Optional
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_pb2 import Change as ChangeBuilder
from muid import Muid

class ChangeSet:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str]=None):
        self._change_set_builder = ChangeSetBuilder()
        self._count_items = 0
        self._sealed = False
        if comment:
            self._change_set_builder.comment = comment # type: ignore # pylint: disable=maybe-no-member

    def add_change(self, change_builder: ChangeBuilder) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = Muid(offset=self._count_items, change_set=self)
        self._change_set_builder.changes[self._count_items] = change_builder  # type: ignore # pylint: disable=maybe-no-member
        return muid
