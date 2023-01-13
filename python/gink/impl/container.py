""" Defines the Container base class. """
from typing import Optional, Union
from abc import ABC, abstractmethod
from sys import stdout

from ..builders.entry_pb2 import Entry as EntryBuilder
from ..builders.change_pb2 import Change as ChangeBuilder

from .muid import Muid
from .bundler import Bundler
from .database import Database
from .typedefs import GenericTimestamp, EPOCH, UserKey, MuTimestamp
from .coding import encode_key, encode_value, decode_value, deletion

class Container(ABC):
    """ Abstract base class for mutable data types (directories, sequences, etc). """
    _database: Database

    def __init__(self, database: Database, muid: Muid):
        self._database = database
        self._muid = muid

    def __eq__(self, other):
        return isinstance(other, self.__class__) and other._muid == self._muid

    def __hash__(self):
        return hash(self._muid)

    def __repr__(self):
        if self._muid.timestamp == -1 and self._muid.medallion == -1:
            return f"{self.__class__.__name__}(root=True)"
        return f"{self.__class__.__name__}('{self._muid}')"

    @abstractmethod
    def dumps(self, as_of: GenericTimestamp=None) -> str:
        """ return the contents of this container as a string """

    def dump(self, *, as_of: GenericTimestamp=None, file=stdout):
        """ Dumps the contents of this container to file (default stdout)."""
        # probably should stream the contents to the filehandle
        file.write("\n")
        file.write(self.dumps(as_of=as_of))
        file.write("\n\n")
        file.flush()

    def _get_occupant(self, builder: EntryBuilder, address: Optional[Muid] = None):
        """ Figures out what the container is containing.

            Returns either a Container or a UserValue
        """
        if builder.HasField("value"): # type: ignore
            return decode_value(builder.value) # type: ignore
        if builder.HasField("pointee"): # type: ignore
            pointee = getattr(builder, "pointee")
            assert address is not None
            pointee_muid = Muid.create(builder=pointee, context=address)
            return self._database.get_container(pointee_muid)

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
    def get_global_instance(cls, database: Optional[Database]=None):
        """ Gets a proxy to the "magic" global instance of the given class.

            For each container type there's a pre-existing global instance
            with address Muid(timestamp=-1, medallion=-1, offset=<behavior>).
            This container type can be written to by any instance, and may
            be used to coordinate between database instances or just for
            testing/demo purposes.
        """
        if database is None:
            database = Database.last
        assert database is not None
        muid = Muid(timestamp=-1, medallion=-1, offset=cls.get_behavior())
        return cls(database=database, muid=muid)

    @classmethod
    def get_medallion_instance(cls, *, medallion=0, database: Optional[Database]=None):
        """ Gets a proxy to the magic personal instance for this container type.

            For each combination of medallion and container type, there's implicitly
            a pre-existing instance: Muid(timestamp=-1, medallion=<medallion>, offset=<behavior>).
            This instance should only be written to by the owner of the medallion, and may
            be used to store local configuration state (though note this info is still visible
            to other instances).  Additionally, ownership metadata such as the username, hostname,
            and process id will be written to the personal directory for each chain at chain start.
            This info may then be used for "blame" i.e. to track who made what changes when.
        """
        if database is None:
            database = Database.last
        assert database is not None
        if not medallion:
            chain = database.get_chain()
            if chain is None:
                raise ValueError("don't have a medallion until on has been claimed by a write")
            medallion=chain.medallion
        muid = Muid(timestamp=-1, medallion=medallion, offset=cls.get_behavior())
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
            database.commit(bundler)  # type: ignore
        return muid

    def clear(self, bundler: Optional[Bundler]=None, comment: Optional[str]=None) -> Muid:
        """ Removes all entries from this container, returning the muid of the clearance.

            Note that this will also remove entries that aren't visible because they've been
            hidden until some future time with something like .remove(..., dest=10.0).
        """
        # pylint: disable=maybe-no-member
        immediate = False
        if not isinstance(bundler, Bundler):
            bundler = Bundler(comment)
            immediate = True
        change_builder = ChangeBuilder()
        self._muid.put_into(change_builder.clearance.container) # type: ignore
        change_muid = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return change_muid

    def _add_entry(self, *,
            value,
            key: Union[Muid, str, int, bytes, None]=None,
            effective: Optional[MuTimestamp]=None,
            bundler: Optional[Bundler]=None,
            comment: Optional[str]=None,
            expiry: GenericTimestamp=None)->Muid:
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        change_builder = ChangeBuilder()
        # pylint: disable=maybe-no-member
        entry_builder: EntryBuilder = change_builder.entry # type: ignore
        entry_builder.behavior = self.get_behavior()  # type: ignore
        if expiry is not None:
            now = self._database.get_now()
            expiry = self._database.resolve_timestamp(expiry)
            if expiry < now:
                raise ValueError("can't set an expiry to be in the past")
            entry_builder.expiry = expiry # type: ignore
        if effective is not None:
            entry_builder.effective = effective # type: ignore
        self._muid.put_into(entry_builder.container) # type: ignore
        if isinstance(key, (str, int, bytes)):
            encode_key(key, entry_builder.key)  # type: ignore
        if isinstance(key, Muid):
            key.put_into(entry_builder.describing) # type: ignore
        if isinstance(value, Container):
            pointee_muid = value.get_muid()
            if pointee_muid.medallion:
                entry_builder.pointee.medallion = pointee_muid.medallion # type: ignore
            if pointee_muid.timestamp:
                entry_builder.pointee.timestamp = pointee_muid.timestamp # type: ignore
            entry_builder.pointee.offset = pointee_muid.offset # type: ignore
        elif isinstance(value, (str, int, float, dict, tuple, list, bool, type(None))):
            encode_value(value, entry_builder.value) # type: ignore # pylint: disable=maybe-no-member
        elif value == deletion:
            entry_builder.deletion = True  # type: ignore # pylint: disable=maybe-no-member
        else:
            raise ValueError(f"don't know how to add this to gink: {value}")
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return muid

    def reset(
        self, 
        to_time: GenericTimestamp=EPOCH, 
        *, 
        key: Optional[UserKey]=None,
        recursive: bool=False, 
        bundler: Optional[Bundler]=None, 
        comment: Optional[str]=None
    ) -> Bundler:
        """ Resets either a specific key or the whole container to a particular past time.

            (They optional key argument only makes sense when the container is a directory).

            Note that this actually creates new entries to literally "re"-set items.
            So it'll still be possible to look at before the reset time and see history.
            Also that means that unseen changes made before the reset but not received
            by this node won't be overwritten.  If you want to ensure that all entries
            written before the current time are removed (even if they're not seen yet),
            then use a clear operation (possibly followed by a reset to get old values).

            This function returns the bundler (either passed-in or created on the fly).
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        assert isinstance(bundler, Bundler)
        to_time = self._database.resolve_timestamp(to_time)
        for change in self._database.get_store().get_reset_changes(to_time=to_time,
                container=self._muid, user_key=key, recursive=recursive):
            bundler.add_change(change)
        if immediate and len(bundler):
            self._database.commit(bundler=bundler)
        return bundler

    @abstractmethod
    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """

    def __len__(self):
        return self.size()
