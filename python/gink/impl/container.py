""" Defines the Container base class. """
from typing import Optional, Union, Iterable, Tuple
from typeguard import typechecked
from abc import ABC, abstractmethod
from sys import stdout
from datetime import datetime

from .builders import ChangeBuilder, EntryBuilder, Behavior

from .muid import Muid
from .bundler import Bundler
from .database import Database
from .typedefs import GenericTimestamp, EPOCH, UserKey, MuTimestamp, UserValue, Deletion, Inclusion
from .coding import encode_key, encode_value, decode_value, deletion, inclusion
from .addressable import Addressable
from .tuples import Chain
from .utilities import generate_timestamp, normalize_pair

class Container(Addressable, ABC):
    """ Abstract base class for mutable data types (directories, sequences, etc). """

    @typechecked
    def __init__(self,
                 *,
                 behavior: Optional[int] = None,  # only optional if a muid is passed
                 bundler: Optional[Bundler] = None,  # only optional if a muid is passed
                 muid: Optional[Union[Muid, str]] = None,
                 arche: Optional[bool] = None,
                 database: Optional[Database]=None,
                 ):
        if arche and muid:
            raise ValueError("Can't pass both arche and a muid")

        database = database or Database.get_last()
        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        if not muid:
            assert isinstance(behavior, int), "Must pass the desired behavior if not supplying a muid"
            if arche:
                muid = Muid(-1, -1, behavior)
            elif muid is None:
                assert isinstance(bundler, Bundler), "Must pass a bundler"  # This should be handled in each subclass
                muid = Container._create(behavior, database=database, bundler=bundler)
        assert isinstance(muid, Muid)
        # self._muid and self._database are set by Addressable.__init__
        Addressable.__init__(self, database=database, muid=muid)

    def __repr__(self):
        if self._muid.timestamp == -1 and self._muid.medallion == -1:
            return f"{self.__class__.__name__}(arche=True)"
        return f"{self.__class__.__name__}(muid={self._muid!r})"

    def _get_container(self) -> Muid:
        return self._muid

    @abstractmethod
    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Return the contents of this container as a string """

    def dump(self, *, as_of: GenericTimestamp = None, file=stdout):
        """ Dumps the contents of this container to file (default stdout)."""
        # probably should stream the contents to the filehandle
        file.write("\n")
        file.write(self.dumps(as_of=as_of))
        file.write("\n\n")
        file.flush()

    @typechecked
    def set_name(self, name: str, *,
            bundler=None, comment=None) -> Muid:
        """ Sets the name of the container, overwriting any previous name for this container.

            Giving multiple things the same name is not recommended.
        """
        name_property = Muid(-1, -1, Behavior.PROPERTY)
        assert isinstance(name, str), "names must be strings"
        already_named = self.get_name()
        if already_named:
            self._add_entry(
                key=self._muid, value=deletion, on_muid=name_property,
                behavior=Behavior.PROPERTY, bundler=bundler, comment=comment
            )
        return self._add_entry(
            key=self._muid, value=name, on_muid=name_property, behavior=Behavior.PROPERTY,
            bundler=bundler, comment=comment)

    def get_name(self, as_of: GenericTimestamp = None) -> Optional[str]:
        """ Returns the name of this container, if it has one. """
        as_of = self._database.resolve_timestamp(as_of)
        name_property = Muid(-1, -1, Behavior.PROPERTY)
        found = self._database.get_store().get_entry_by_key(name_property, key=self._muid, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return None
        name = self._get_occupant(found.builder)
        assert isinstance(name, str)
        return name

    @typechecked
    def _get_occupant(self, builder: EntryBuilder, address: Optional[Muid] = None) -> Union[UserValue, 'Container']:
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

    @classmethod
    def get_behavior(cls):
        """ Gets the behavior tag/enum for the particular class. """
        assert hasattr(cls, "BEHAVIOR")
        return getattr(cls, "BEHAVIOR")

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
        """ Creates a new container with the given behavior and returns its muid.
            Either adds the change to the provided bundler or immediately bundles it.
        """
        immediate = False
        if bundler is None:
            bundler = Bundler()
            immediate = True
        change_builder = ChangeBuilder()
        container_builder = change_builder.container  # type: ignore # pylint: disable=maybe-no-member
        container_builder.behavior = behavior  # type: ignore
        muid = bundler.add_change(change_builder)
        if immediate:
            database.bundle(bundler)  # type: ignore
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
            self._database.bundle(bundler)
        return change_muid

    @typechecked
    def _add_entry(self, *,
                   value: Union[UserValue, Deletion, Inclusion, 'Container', Muid],
                   key: Union[Muid, str, int, bytes, None, Chain,
                                Tuple[Union['Container', Muid], Union['Container', Muid]],
                                'Container'] = None,
                   effective: Optional[MuTimestamp] = None,
                   bundler: Optional[Bundler] = None,
                   comment: Optional[str] = None,
                   expiry: GenericTimestamp = None,
                   behavior: Optional[int] = None,  # defaults to behavior of current container
                   on_muid: Optional[Muid] = None,  # defaults to current container
                   ) -> Muid:
        """ Add a new entry to this container.

            If on_muid is specified, then the entry will be added to that container instead of this one.
        """
        behavior = behavior or self.get_behavior()
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        change_builder = ChangeBuilder()
        # pylint: disable=maybe-no-member
        entry_builder: EntryBuilder = change_builder.entry  # type: ignore
        entry_builder.behavior = behavior  # type: ignore
        if expiry is not None:
            now = generate_timestamp()
            expiry = self._database.resolve_timestamp(expiry)
            if expiry < now:
                raise ValueError("can't set an expiry to be in the past")
            entry_builder.expiry = expiry  # type: ignore
        if effective is not None:
            entry_builder.effective = effective  # type: ignore
        if on_muid is None:
            on_muid = self._muid
        on_muid.put_into(entry_builder.container)  # type: ignore
        if isinstance(key, bool):
            raise TypeError("Can't use a boolean as a key")
        if isinstance(key, (str, int, bytes)):
            encode_key(key, entry_builder.key)  # type: ignore
        elif isinstance(key, Chain):
            Muid(key.chain_start, key.medallion, 0).put_into(entry_builder.describing)
        elif isinstance(key, Muid):
            key.put_into(entry_builder.describing)  # type: ignore
        elif isinstance(key, Container):
            key._muid.put_into(entry_builder.describing)
        elif isinstance(key, tuple):
            left, rite = normalize_pair(key) # throws value error if not a valid pair
            left.put_into(entry_builder.pair.left)
            rite.put_into(entry_builder.pair.rite)

        elif key is not None:
            raise ValueError(f"Don't know how to add this key to gink: {key}")

        if isinstance(value, Container):
            value = value.get_muid()
        if isinstance(value, Muid):
            if value.medallion:
                entry_builder.pointee.medallion = value.medallion  # type: ignore
            if value.timestamp:
                entry_builder.pointee.timestamp = value.timestamp  # type: ignore
            entry_builder.pointee.offset = value.offset  # type: ignore
        elif isinstance(value, (str, int, float, dict, tuple, list, bool, bytes, type(None), datetime)):
            encode_value(value, entry_builder.value)  # type: ignore # pylint: disable=maybe-no-member
        elif value == deletion:
            entry_builder.deletion = True  # type: ignore # pylint: disable=maybe-no-member
        elif value == inclusion:
            pass
        else:
            raise ValueError(f"don't know how to add this value to gink: {value}")
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.bundle(bundler)
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

            (The optional key argument only makes sense when the container is a directory).

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
            self._database.bundle(bundler=bundler)
        return bundler

    @abstractmethod
    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ Returns the number of elements contained """

    def __len__(self):
        return self.size()

    def get_describing(self, as_of: GenericTimestamp=None) -> Iterable['Container']:
        """ Returns the properties and groups associated with this thing. """
        as_of = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_by_describing(self._muid, as_of):
            container_muid = Muid.create(found.address, found.builder.container)
            if not found.builder.deletion:
                yield self._database.get_container(container_muid, behavior=found.builder.behavior)
