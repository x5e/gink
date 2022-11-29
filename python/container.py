from change_set import ChangeSet
from database import Database
from typing import Optional as Opt, Union
from container_pb2 import Container as ContainerBuilder
from behavior_pb2 import Behavior
from change_pb2 import Change as ChangeBuilder
from muid import Muid

class Container:
    _DELETION = object()

    def __init__(self, database: Database, muid: Muid):
        self._database = database
        self._muid = muid
    
    @classmethod
    def create(cls, change_set: Opt[ChangeSet]=None, database: Opt[Database]=None):
        if database is None:
            database = Database.last()
        muid = Container._create(cls.BEHAVIOR, change_set=change_set, database=database)
        return cls(muid=muid, database=database)

    @classmethod
    def global_instance(cls, database: Opt[Database]=None):
        return cls(database=database, muid=Muid(timestamp=-1, medallion=-1, offset=cls.BEHAVIOR))

    @staticmethod
    def _create(behavior: int, database: Database, change_set: Opt[ChangeSet]=None) -> Muid:
        immediate = False
        if change_set is None:
            change_set = ChangeSet()
            immediate = True
        container_builder = ContainerBuilder()
        container_builder.behavior = behavior
        change_builder = ChangeBuilder()
        change_builder.container = container_builder
        muid = change_set.add_change(change_builder)
        if immediate:
            database.add_change_set(change_set)
        return muid
        
    def _add_entry(self, key: Union[str, int, bool, None], value, change_set: Opt[ChangeSet]=None)->Muid:
        pass
