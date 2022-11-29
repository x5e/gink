""" Defines the Container base class. """
from typing import Optional as Opt, Union as U
from abc import ABC
from change_set import ChangeSet
from database import Database
from container_pb2 import Container as ContainerBuilder
from muid_pb2 import Muid as MuidBuilder
from entry_pb2 import Entry as EntryBuilder
#from behavior_pb2 import Behavior
from change_pb2 import Change as ChangeBuilder
from muid import Muid
from code_values import encode_key, encode_value

class Container(ABC):
    """ Abstract base class for mutable data types (directories, queues, etc). """
    _DELETION = object()

    def __init__(self, database: Database, muid: Muid):
        self._database = database
        self._muid = muid

    def muid(self) -> Muid:
        """ returns the global address of this container """
        return self._muid

    @classmethod
    def get_behavior(cls):
        """ Gets the behavior tag/enum for the particular class. """
        assert hasattr(cls, "BEHAVIOR")
        return getattr(cls, "BEHAVIOR")

    @classmethod
    def create(cls, change_set: Opt[ChangeSet]=None, database: Opt[Database]=None):
        """ Creates an instance of the given class, committing if no change set is provided. """
        if database is None:
            database = Database.last()
        muid = Container._create(cls.get_behavior(), change_set=change_set, database=database)
        return cls(muid=muid, database=database)

    @classmethod
    def global_instance(cls, database: Opt[Database]=None):
        """ Gets a proxy to the "magic" global instance of the given class. """
        if database is None:
            database = Database.last()
        assert database is not None
        muid = Muid(timestamp=-1, medallion=-1, offset=cls.get_behavior())
        return cls(database=database, muid=muid)

    @staticmethod
    def _create(behavior: int, database: Database, change_set: Opt[ChangeSet]=None) -> Muid:
        immediate = False
        if change_set is None:
            change_set = ChangeSet()
            immediate = True
        container_builder = ContainerBuilder()
        container_builder.behavior = behavior  # type: ignore
        change_builder = ChangeBuilder()
        change_builder.container = container_builder  # type: ignore
        muid = change_set.add_change(change_builder)
        if immediate:
            database.add_change_set(change_set)  # type: ignore
        return muid
        
    def _add_entry(
            self,
            key: U[str, int, bool, None],
            value,
            change_set: Opt[ChangeSet]=None,
            comment: Opt[str]=None
            )->Muid:

        immediate = False
        if not isinstance(change_set, ChangeSet):
            immediate = True
            change_set = ChangeSet(comment)
        entry_builder = EntryBuilder()
        if isinstance(key, (str, int)):
            entry_builder.key = encode_key(key) # type: ignore # pylint: disable=maybe-no-member
        if isinstance(key, bool):
            entry_builder.boxed = True # type: ignore # pylint: disable=maybe-no-member
        if isinstance(value, Container):
            pointee_muid = value.muid()
            if pointee_muid.medallion:
                entry_builder.pointee.medallion = pointee_muid.medallion # type: ignore # pylint: disable=maybe-no-member
            if pointee_muid.timestamp:
                entry_builder.pointee.timestamp = pointee_muid.timestamp # type: ignore # pylint: disable=maybe-no-member
            entry_builder.pointee.offset = pointee_muid.offset # type: ignore # pylint: disable=maybe-no-member
        if isinstance(value, (str, int, float, dict, tuple, bool, type(None))):
            entry_builder.immediate = encode_value(value) # type: ignore # pylint: disable=maybe-no-member
        change_builder = ChangeBuilder()
        change_builder.entry = entry_builder # type: ignore # pylint: disable=maybe-no-member
        muid = change_set.add_change(change_builder)
        if immediate:
            self._database.add_change_set(change_set)
        return muid
