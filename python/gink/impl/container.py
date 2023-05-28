""" Defines the Container base class. """
from __future__ import annotations
from typing import Optional, Union, Iterable
from abc import ABC, abstractmethod
from sys import stdout

from .builders import ChangeBuilder, EntryBuilder, Behavior

from .muid import Muid
from .bundler import Bundler
from .database import Database
from .typedefs import GenericTimestamp, EPOCH, UserKey, MuTimestamp, UserValue, Deletion, Inclusion
from .coding import encode_key, encode_value, decode_value, deletion, inclusion


class Container(ABC):
    """ Abstract base class for mutable data types (directories, sequences, etc). """

    def __init__(self, database: Database, muid: Muid):
        self._database: Database = database
        self._muid: Muid = muid

    def __eq__(self, other):
        return isinstance(other, self.__class__) and other._muid == self._muid

    def __hash__(self):
        return hash(self._muid)

    def __repr__(self):
        if self._muid.timestamp == -1 and self._muid.medallion == -1:
            return f"{self.__class__.__name__}(root=True)"
        return f"{self.__class__.__name__}('{self._muid}')"

    @abstractmethod
    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """

    def dump(self, *, as_of: GenericTimestamp = None, file=stdout):
        """ Dumps the contents of this container to file (default stdout)."""
        # probably should stream the contents to the filehandle
        file.write("\n")
        file.write(self.dumps(as_of=as_of))
        file.write("\n\n")
        file.flush()

    def get_property_value_by_name(self, name: str, *, default=None, as_of: GenericTimestamp=None) -> UserValue:
        """ Returns the value of the property with the given name on this container.

            Raises an error if more or less than one property exists for the given name.
        """
        ts = self._database.resolve_timestamp(as_of)
        store = self._database.get_store()
        hits = [fc for fc in store.get_by_name(name, ts) if fc.builder.behavior == Behavior.PROPERTY]
        if len(hits) > 1:
            raise ValueError("More than one property has that name!")
        if len(hits) < 1:
            raise ValueError("No property has that name!")
        found = self._database.get_store().get_entry_by_key(hits[0].address, key=self._muid, as_of=ts)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        result = self._get_occupant(found.builder)
        assert not isinstance(result, Container)
        return result

    def set_property_value_by_name(self, name: str, value: UserValue, *,
                                   create=True, bundler=None, comment=None):
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        store = self._database.get_store()
        hits = [fc for fc in store.get_by_name(name) if fc.builder.behavior == Behavior.PROPERTY]
        if len(hits) > 1:
            raise ValueError("More than one property has that name!")
        if len(hits) == 0:
            if create:
                creating_change = ChangeBuilder()
                creating_change.container.behavior = Behavior.PROPERTY
                property_muid = bundler.add_change(creating_change)
                naming_change = ChangeBuilder()
                Muid(-1, -1, Behavior.PROPERTY).put_into(naming_change.entry.container)
                property_muid.put_into(naming_change.entry.describing)
                naming_change.entry.behavior = Behavior.PROPERTY
                encode_value(name, naming_change.entry.value)
                bundler.add_change(naming_change)
            else:
                raise ValueError("no property with that name exists and create is not true")
        else:
            property_muid = hits[0].address
        setting_change = ChangeBuilder()
        setting_change.entry.behavior = Behavior.PROPERTY
        property_muid.put_into(setting_change.entry.container)
        self._muid.put_into(setting_change.entry.describing)
        encode_value(value, setting_change.entry.value)
        muid = bundler.add_change(setting_change)
        if immediate:
            self._database.commit(bundler)
        return muid

    def set_name(self, name: str, *,
            bundler=None, comment=None) -> Muid:
        """ Sets the name of the container, overwriting any previous name for this container.

            Giving multiple things the same name is not recommended.
        """
        name_property = Muid(-1, -1, Behavior.PROPERTY)
        assert isinstance(name, str), "names must be strings"
        return self._add_entry(
            key=self._muid, value=name, on_muid=name_property, behavior=Behavior.PROPERTY,
            bundler=bundler, comment=comment)

    def get_name(self, as_of: GenericTimestamp = None) -> Optional[str]:
        as_of = self._database.resolve_timestamp(as_of)
        name_property = Muid(-1, -1, Behavior.PROPERTY)
        found = self._database.get_store().get_entry_by_key(name_property, key=self._muid, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return None
        name = self._get_occupant(found.builder)
        assert isinstance(name, str)
        return name


    def _get_occupant(self, builder: EntryBuilder, address: Optional[Muid] = None) -> Union[UserValue, Container]:
        """ Figures out what the container is containing.

            Returns either a Container or a UserValue
        """
        if builder.HasField("value"):  # type: ignore
            return decode_value(builder.value)  # type: ignore
        if builder.HasField("pointee"):  # type: ignore
            pointee = getattr(builder, "pointee")
            assert address is not None
            pointee_muid = Muid.create(builder=pointee, context=address)
            return self._database.get_container(pointee_muid)
        raise Exception("unexpected")

    def get_muid(self) -> Muid:
        """ returns the global address of this container """
        return self._muid

    @classmethod
    def get_behavior(cls):
        """ Gets the behavior tag/enum for the particular class. """
        assert hasattr(cls, "BEHAVIOR")
        return getattr(cls, "BEHAVIOR")

    @classmethod
    def create(cls, bundler: Optional[Bundler] = None, database: Optional[Database] = None):
        """ Creates an instance of the given class, adding immediately if no bundler is provided.
        """
        if database is None:
            database = Database.get_last()
        muid = Container._create(cls.get_behavior(), bundler=bundler, database=database)
        return cls(muid=muid, database=database)

    @classmethod
    def get_global_instance(cls, database: Optional[Database] = None):
        """ Gets a proxy to the "magic" global instance of the given class.

            For each container type there's a pre-existing global instance
            with address Muid(timestamp=-1, medallion=-1, offset=<behavior>).
            This container type can be written to by any instance, and may
            be used to coordinate between database instances or just for
            testing/demo purposes.
        """
        if database is None:
            database = Database.get_last()
        assert database is not None
        muid = Muid(timestamp=-1, medallion=-1, offset=cls.get_behavior())
        return cls(database=database, muid=muid)

    @classmethod
    def get_medallion_instance(cls, *, medallion=0, database: Optional[Database] = None):
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
            database = Database.get_last()
        assert database is not None
        if not medallion:
            chain = database.get_chain()
            if chain is None:
                raise ValueError("don't have a medallion until on has been claimed by a write")
            medallion = chain.medallion
        muid = Muid(timestamp=-1, medallion=medallion, offset=cls.get_behavior())
        return cls(database=database, muid=muid)

    @staticmethod
    def _create(behavior: int, database: Database, bundler: Optional[Bundler] = None) -> Muid:
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

    def clear(self, bundler: Optional[Bundler] = None, comment: Optional[str] = None) -> Muid:
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
        self._muid.put_into(change_builder.clearance.container)  # type: ignore
        change_muid = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return change_muid

    def  _add_entry(self, *,
                   value: Union[UserValue, Deletion, Inclusion, Container],
                   key: Union[Muid, str, int, bytes, None] = None,
                   effective: Optional[MuTimestamp] = None,
                   bundler: Optional[Bundler] = None,
                   comment: Optional[str] = None,
                   expiry: GenericTimestamp = None,
                   behavior: Optional[int] = None, # defaults to behavior of current container
                   on_muid: Optional[Muid] = None, # defaults to current container
                   ) -> Muid:
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        change_builder = ChangeBuilder()
        # pylint: disable=maybe-no-member
        entry_builder: EntryBuilder = change_builder.entry  # type: ignore
        entry_builder.behavior = behavior or self.get_behavior()  # type: ignore
        if expiry is not None:
            now = self._database.get_now()
            expiry = self._database.resolve_timestamp(expiry)
            if expiry < now:
                raise ValueError("can't set an expiry to be in the past")
            entry_builder.expiry = expiry  # type: ignore
        if effective is not None:
            entry_builder.effective = effective  # type: ignore
        if on_muid is None:
            on_muid = self._muid
        on_muid.put_into(entry_builder.container)  # type: ignore
        if isinstance(key, (str, int, bytes)):
            encode_key(key, entry_builder.key)  # type: ignore
        if isinstance(key, Muid):
            key.put_into(entry_builder.describing)  # type: ignore
        if isinstance(value, Container):
            pointee_muid = value.get_muid()
            if pointee_muid.medallion:
                entry_builder.pointee.medallion = pointee_muid.medallion  # type: ignore
            if pointee_muid.timestamp:
                entry_builder.pointee.timestamp = pointee_muid.timestamp  # type: ignore
            entry_builder.pointee.offset = pointee_muid.offset  # type: ignore
        elif isinstance(value, (str, int, float, dict, tuple, list, bool, bytes, type(None))):
            encode_value(value, entry_builder.value)  # type: ignore # pylint: disable=maybe-no-member
        elif value == deletion:
            entry_builder.deletion = True  # type: ignore # pylint: disable=maybe-no-member
        elif value == inclusion:
            pass
        else:
            raise ValueError(f"don't know how to add this to gink: {value}")
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return muid

    def reset(
            self,
            to_time: GenericTimestamp = EPOCH,
            *,
            key: Optional[UserKey] = None,
            recursive: bool = False,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None
    ) -> Bundler:
        """ Resets either a specific key or the whole container to a particular past timestamp.

            (They optional key argument only makes sense when the container is a directory).

            Note that this actually creates new entries to literally "re"-set items.
            So it'll still be possible to look at before the reset time and see history.
            Also, that means that unseen changes made before the reset but not received
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
                                                                   container=self._muid, user_key=key,
                                                                   recursive=recursive):
            bundler.add_change(change)
        if immediate and len(bundler):
            self._database.commit(bundler=bundler)
        return bundler

    @abstractmethod
    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """

    def __len__(self):
        return self.size()

    def get_describing(self, as_of: GenericTimestamp=None) -> Iterable[Container]:
        as_of = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_by_describing(self._muid, as_of):
            yield self._database.get_container(found.address, found.builder)
