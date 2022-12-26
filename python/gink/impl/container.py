""" Defines the Container base class. """
from typing import Optional, Union, Dict, Type
from abc import ABC

from ..builders.entry_pb2 import Entry as EntryBuilder
from ..builders.change_pb2 import Change as ChangeBuilder
from ..builders.clearance_pb2 import Clearance as ClearanceBuilder

from .muid import Muid
from .bundler import Bundler
from .database import Database
from .coding import encode_key, encode_value, decode_value

class Container(ABC):
    """ Abstract base class for mutable data types (directories, sequences, etc). """
    _DELETE = object()
    _subtypes: Dict[int, Type] = {}

    def __init__(self, database: Database, muid: Muid):
        self._database = database
        self._muid = muid

    def __eq__(self, other):
        return type(other) == type(self) and other._muid == self._muid

    def __hash__(self):
        return hash(self._muid)

    def __repr__(self):
        return f"{self.__class__.__name__}(muid={repr(self._muid)})"

    def _interpret(self, builder: EntryBuilder, address: Optional[Muid] = None):
        if builder.HasField("value"): # type: ignore
            return decode_value(builder.value) # type: ignore
        if builder.HasField("pointee"): # type: ignore
            pointee = getattr(builder, "pointee")
            pointee_muid = Muid.create(pointee, context=address)
            behavior = getattr(builder, "behavior")
            Class = Container._subtypes.get(behavior)
            if not Class:
                raise AssertionError(f"behavior not recognized: {behavior}")
            return Class(muid=pointee_muid, database=self._database)

    def get_muid(self) -> Muid:
        """ returns the global address of this container """
        return self._muid

    @classmethod
    def get_behavior(cls):
        """ Gets the behavior tag/enum for the particular class. """
        assert hasattr(cls, "BEHAVIOR")
        return getattr(cls, "BEHAVIOR")

    @classmethod
    def create(cls, bundler: Optional[Bundler]=None, database: Optional[Database]=None):
        """ Creates an instance of the given class, adding immediately if no bundler is provided.
        """
        if database is None:
            database = Database.last
        muid = Container._create(cls.get_behavior(), bundler=bundler, database=database)
        return cls(muid=muid, database=database)

    @classmethod
    def global_instance(cls, database: Optional[Database]=None):
        """ Gets a proxy to the "magic" global instance of the given class. """
        if database is None:
            database = Database.last
        assert database is not None
        muid = Muid(timestamp=-1, medallion=-1, offset=cls.get_behavior())
        return cls(database=database, muid=muid)

    @staticmethod
    def _create(behavior: int, database: Database, bundler: Optional[Bundler]=None) -> Muid:
        immediate = False
        if bundler is None:
            bundler = Bundler()
            immediate = True
        change_builder = ChangeBuilder()
        container_builder = change_builder.container  # type: ignore # pylint: disable=maybe-no-member
        container_builder.behavior = behavior  # type: ignore
        muid = bundler.add_change(change_builder)
        if immediate:
            database.add_bundle(bundler)  # type: ignore
        return muid

    def clear(self, bundler: Optional[Bundler]=None, comment: Optional[str]=None) -> Muid:
        """ Removes all entries from this container, returning the muid of the clearance.
        """
        immediate = False
        if not isinstance(bundler, Bundler):
            bundler = Bundler(comment)
            immediate = True
        change_builder = ChangeBuilder()
        self._muid.put_into(change_builder.clearance.container) # type: ignore
        change_muid = bundler.add_change(change_builder)
        if immediate:
            self._database.add_bundle(bundler)
        return change_muid

    def _add_entry(self, *, value, key: Union[str, int, None]=None, expiry: int=0,
             bundler: Optional[Bundler]=None, comment: Optional[str]=None)->Muid:
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        change_builder = ChangeBuilder()
        # pylint: disable=maybe-no-member
        entry_builder: EntryBuilder = change_builder.entry # type: ignore
        entry_builder.behavior = self.get_behavior()  # type: ignore
        entry_builder.expiry = expiry # type: ignore
        self._muid.put_into(entry_builder.container) # type: ignore
        if isinstance(key, (str, int)):
            encode_key(key, entry_builder.key)  # type: ignore
        if isinstance(value, Container):
            pointee_muid = value.get_muid()
            if pointee_muid.medallion:
                entry_builder.pointee.medallion = pointee_muid.medallion # type: ignore
            if pointee_muid.timestamp:
                entry_builder.pointee.timestamp = pointee_muid.timestamp # type: ignore
            entry_builder.pointee.offset = pointee_muid.offset # type: ignore
        elif isinstance(value, (str, int, float, dict, tuple, list, bool, type(None))):
            encode_value(value, entry_builder.value) # type: ignore # pylint: disable=maybe-no-member
        elif value == self._DELETE:
            entry_builder.deleting = True  # type: ignore # pylint: disable=maybe-no-member
        else:
            raise ValueError(f"don't know how to add this to gink: {value}")
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.add_bundle(bundler)
        return muid
