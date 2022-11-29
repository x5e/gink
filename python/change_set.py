from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_pb2 import Change as ChangeBuilder
from muid import Muid

class ChangeSet:
    def __init__(self):
        self._change_set_builder = ChangeSetBuilder()
        self._count_items = 0
        self._sealed = False
    
    def add_change(self, change_builder: ChangeBuilder) -> Muid:
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = Muid(offset=self._count_items, change_set=self)
        self._change_set_builder[self._count_items] = change_builder
        return muid

