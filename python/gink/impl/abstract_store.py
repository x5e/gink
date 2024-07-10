"""Contains AbstractStore class."""

# standard python modules
from typing import Tuple, Optional, Iterable, List, Union, Mapping, TypeVar, Generic, Callable
from abc import abstractmethod


# Gink specific modules
from .builders import ContainerBuilder, ChangeBuilder, EntryBuilder, ClaimBuilder
from .bundle_info import BundleInfo
from .chain_tracker import ChainTracker
from .typedefs import UserKey, MuTimestamp, Medallion, Limit
from .tuples import FoundEntry, Chain, PositionedEntry, FoundContainer
from .muid import Muid
from .bundle_wrapper import BundleWrapper
from .utilities import is_certainly_gone
from .bundle_store import BundleStore
Lock = TypeVar('Lock')


class AbstractStore(BundleStore, Generic[Lock]):
    """ abstract base class for the gink data store

        Stores both the bundles received and the contents of those
        bundles unpacked so that you can examine entries, container definitions, etc.

        Warning! Since data stores are viewed as part of the internal implementation,
        this interface may change at any time without warning on a minor version change.
    """

    def __enter__(self):
        pass

    def __exit__(self, *_):
        self.close()

    @abstractmethod
    def get_container(self, container: Muid) -> Optional[ContainerBuilder]:
        """ Gets the container definition associated with a particular address. """

    @abstractmethod
    def get_comment(self, *, medallion: Medallion, timestamp: MuTimestamp) -> Optional[str]:
        """ Gets the comment associated with a particular bundle, if stored. """
        raise NotImplementedError()

    @abstractmethod
    def get_keyed_entries(self, container: Muid, behavior: int, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        """ Gets all active entries for a given container as of the given time. """
        raise NotImplementedError()

    @abstractmethod
    def get_entry_by_key(self, container: Muid, key: Union[UserKey, Muid, None, Tuple[Muid, Muid]],
                         as_of: MuTimestamp) -> Optional[FoundEntry]:
        """ Gets the most recent entry for a given key at as_of
        """
        # TODO: change to return FoundEntry or Clearance or None

    @abstractmethod
    def get_positioned_entry(self, entry: Muid, as_of: MuTimestamp = -1) -> Optional[PositionedEntry]:
        """ Returns the position and contents of an entry, if available, at as_of time.
        """
        raise NotImplementedError()

    @abstractmethod
    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int] = None,
                            offset: int = 0, desc: bool = False) -> Iterable[PositionedEntry]:
        """ Get data for Sequence and Registry data types.
        """

    @abstractmethod
    def get_edge_entries(
            self, *,
            as_of: MuTimestamp,
            verb: Optional[Muid] = None,
            source: Optional[Muid] = None,
            target: Optional[Muid] = None) -> Iterable[FoundEntry]:
        """ Returns all the edge entries with specified verb and/or subject and/or object. """

    @abstractmethod
    def get_entry(self, muid: Muid) -> Optional[EntryBuilder]:
        """ Return the entry builder for a entry if it's visible in the store. """

    def close(self):
        """Safely releases resources."""

    def is_closed(self) -> bool:
        """ return true if closed """
        return False

    @abstractmethod
    def _refresh_helper(self, lock: Lock, callback: Optional[Callable[[BundleWrapper], None]]=None, /) -> int:
        """ do a refresh using a lock/transaction """

    def maybe_reuse_chain(
            self,
            identity: str,
            callback: Optional[Callable[[BundleWrapper], None]]=None) -> Optional[BundleInfo]:
        """ Tries to find a chain for reuse.  The callback is used for refresh.
        """
        lock: Lock = self._acquire_lock()
        try:
            self._refresh_helper(lock, callback)
            claims = self._get_claims(lock)
            for old_claim in claims.values():
                chain = Chain(medallion=old_claim.medallion, chain_start=old_claim.chain_start)
                if self.get_identity(chain) == identity and is_certainly_gone(old_claim.process_id):
                    self._add_claim(lock, chain)
                    return self.get_last(chain)
            else:
                return None
        finally:
            self._release_lock(lock)

    @abstractmethod
    def _acquire_lock(self) -> Lock:
        """ Get handle that can be used to get and add claims. """

    @abstractmethod
    def _add_claim(self, lock: Lock, chain: Chain, /) -> ClaimBuilder:
        """ Mark a chain as having been acquired. """

    @abstractmethod
    def _get_claims(self, lock: Lock, /) -> Mapping[Medallion, ClaimBuilder]:
        """ Get claims. """

    @abstractmethod
    def _release_lock(self, lock: Lock, /):
        """ Finalize Transaction """

    @abstractmethod
    def apply_bundle(
            self,
            bundle: Union[BundleWrapper, bytes],
            callback: Optional[Callable[[BundleWrapper], None]]=None,
            claim_chain: bool=False) -> bool:
        """ Tries to add data from a particular bundle to this store.

            Returns true if the data is actually added, false if data already exists,
            and will throw an exception in the case of an invalid extension.
        """

    def refresh(self, callback: Optional[Callable[[BundleWrapper], None]]=None) -> int:
        """ Checks the source file for bundles that haven't come from this process and calls the callback.

            Intended to allow the process to send bundles to peers and otherwise get the model in line with the file.

            Returns the number of transactions processed.
        """
        lock = self._acquire_lock()
        if count := self._refresh_helper(lock, callback):
            self._clear_notifications()
        self._release_lock(lock)
        return count

    def get_bundle_infos(self, limit_to: Optional[Mapping[Chain, Limit]] = None) -> List[BundleInfo]:
        """ Gets a list of bundle infos; mostly for testing. """
        result = []

        def callback(bundle_wrapper: BundleWrapper):
            result.append(bundle_wrapper.get_info())

        self.get_bundles(callback, limit_to=limit_to)
        return result

    @abstractmethod
    def list_containers(self) -> Iterable[Tuple[Muid, ContainerBuilder]]:
        """ Gets the address and definition of each regular container.

            Does not include the instance/medallion containers or the global containers.
        """

    @abstractmethod
    def get_some(self, cls, last_index: Optional[int] = None) -> Iterable:
        """ Gets several indexes of the given class.

            Starts counting from the end if last_index is negative.

            cls may be one of: BundleBuilder, EntryBuilder, MovementBuilder,
            or one of the key classes: BundleInfo, EntryStorageKey, MovementKey

            Used by the database class to show a log of entries.
        """

    def get_one(self, cls, index: int = -1):
        """ gets one instance of the given class """
        returning = None
        expected = (index if index >= 0 else ~index) + 1
        actual = 0
        for thing in self.get_some(cls, last_index=index):
            actual += 1
            returning = thing
        if actual == expected:
            return returning
        else:
            return None

    @abstractmethod
    def get_chain_tracker(self, limit_to: Optional[Mapping[Chain, Limit]]=None) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""

    @abstractmethod
    def get_last(self, chain: Chain) -> BundleInfo:
        """ Returns metadata for the last bundle in a specified chain. """

    @abstractmethod
    def get_identity(self, chain: Chain, lock: Optional[Lock]=None, /) -> str:
        """ The comment on the first bundle of each chain identifies who or what is responsible for it.
        """

    @abstractmethod
    def find_chain(self, medallion: Medallion, timestamp: MuTimestamp) -> Chain:
        """ Find the chain with the matching medallion and the first chain start prior
            to the timestamp argument passed in.
        """

    @staticmethod
    def _is_needed(new_info: BundleInfo, old_info: Optional[BundleInfo]) -> bool:
        seen_through = 0
        if old_info:
            assert old_info.get_chain() == new_info.get_chain()
            seen_through = old_info.timestamp
        if seen_through >= new_info.timestamp:
            return False
        if new_info.timestamp != new_info.chain_start and not new_info.previous:
            raise ValueError("Bundle isn't the start but has no prior.")
        if (new_info.previous or seen_through) and new_info.previous != seen_through:
            raise ValueError("Bundle received without prior link in chain!")
        return True

    @abstractmethod
    def get_reset_changes(self, to_time: MuTimestamp, container: Optional[Muid],
                          user_key: Optional[UserKey], recursive=False) -> Iterable[ChangeBuilder]:
        """
        Generates reset entries that will change things back to how they were at given time.

        If muid isn't specified, generates reset entries for all keyed objects in store.
        If muid is specified, generates reset entries for that object, for the
        specified key if present, otherwise for all keys.

        If needed_only is set to True (the default), then no entry will be generated for a
        particular muid,key pair if the current value matches the value at the specified time.
        If needed_only is set to False, generates new entries for everything.

        If recursive is set to true, then will go and recursively update all entries
        in child objects that were referenced at to_time.
        """

    @abstractmethod
    def get_by_name(self, name, as_of: MuTimestamp = -1) -> Iterable[FoundContainer]:
        """ Returns info about all things with the given name.
        """

    @abstractmethod
    def get_by_describing(self, desc: Muid, as_of: MuTimestamp = -1) -> Iterable[FoundEntry]:
        """ Returns all the containers (properties) that describe desc.
        """
