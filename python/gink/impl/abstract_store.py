"""Contains AbstractStore class."""

# standard python modules
from typing import Tuple, Callable, Optional, Iterable, List, Union
from abc import ABC, abstractmethod

# protobuf builders
from ..builders.change_pb2 import Change as ChangeBuilder

# Gink specific modules
from .bundle_info import BundleInfo
from .chain_tracker import ChainTracker
from .typedefs import UserKey, MuTimestamp, Medallion
from .tuples import FoundEntry, Chain, PositionedEntry
from .muid import Muid

class AbstractStore(ABC):
    """ abstract base class for the gink data store

        Stores both the bundles received as well as the contents of those
        bundles unpacked so that you can examine entries, container definitions, etc.

        Warning! Since data stores are viewed as part of the internal implementation,
        this interface may change at any time without warning on a minor version change.
    """

    def __enter__(self):
        pass

    def __exit__(self, *_):
        self.close()

    @abstractmethod
    def get_comment(self, *, medallion: Medallion, timestamp: MuTimestamp) -> Optional[str]:
        """ Gets the comment associated with a particular bundle/commit, if stored. """
        raise NotImplementedError()

    @abstractmethod
    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        """ Gets all active entries for a given container as of the given time. """
        raise NotImplementedError()

    @abstractmethod
    def get_entry_by_key(self, container: Muid, key: Union[UserKey, Muid, None],
            as_of: MuTimestamp) -> Optional[FoundEntry]:
        """ Gets the most recent entry for a given key at as_of
        """
        assert self and container and key and as_of
        raise NotImplementedError()

    @abstractmethod
    def get_positioned_entry(self, entry: Muid, as_of: MuTimestamp=-1)->Optional[PositionedEntry]:
        """ Returns the position and contents of a an entry, if available, at as_of time.
        """
        raise NotImplementedError()

    @abstractmethod
    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int]=None,
            offset: int=0, desc: bool=False) -> Iterable[PositionedEntry]:
        """ Get data for Sequence and Registry data types.
        """
        assert self or container or as_of or limit or offset or desc
        raise NotImplementedError()

    def close(self):
        """Safely releases resources."""

    @abstractmethod
    def get_claimed_chains(self) -> Iterable[Chain]:
        """ Returns the chains that this store as started and can write to. """
        assert self
        raise NotImplementedError()

    @abstractmethod
    def claim_chain(self, chain: Chain):
        """ Marks a chain as being owned by this store for future use. """
        assert self and chain
        raise NotImplementedError()

    @abstractmethod
    def apply_bundle(self, bundle_bytes: bytes) -> Tuple[BundleInfo, bool]:
        """ Tries to add data from a particular bundle to this store.

            Returns: a tuple of the bundle's info and boolean indicating if it was applied
            Will not be applied if this store has already seen this bundle before.
        """
        assert bundle_bytes and self
        raise NotImplementedError()

    @abstractmethod
    def get_bundles(self, callback: Callable[[bytes, BundleInfo], None], since: MuTimestamp=0):
        """ Calls the callback with each bundle, in (timestamp, medallion) order.

            This is done callback style because we don't want to leave dangling transactions
            in the store, which could easily happen if we offered up an iterator interface instead.
        """
        assert callback and self
        raise NotImplementedError()

    def get_bundle_infos(self) -> List[BundleInfo]:
        """ Gets a list of bundle infos; mostly for testing. """
        result = []
        def callback(_, info: BundleInfo):
            result.append(info)
        self.get_bundles(callback)
        return result

    @abstractmethod
    def get_one(self, cls, index: int=-1):
        """ Gets one instance of the specified class at "index" location in its respective store.

            "Class" may be one of: BundleBuilder, EntryBuilder, MovementBuilder,
            or one of the key classes: BundleInfo, EntryStorageKey, MovementKey

            This method is mostly intended to make debugging easier, but will also be used by
            the Gink database class to look up the most recent timestamps.
         """
        raise NotImplementedError()

    @abstractmethod
    def get_chain_tracker(self) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
        assert self
        raise NotImplementedError()

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

    def get_reset_changes(self, to_time: MuTimestamp, container: Optional[Muid],
        user_key: Optional[UserKey], recursive=False) -> Iterable[ChangeBuilder]:
        """
        Generates reset entries that will change things back to how they were at given time.

        If muid isn't specified, generates reset entries for all keyed objects in store.
        If muid is specified, generates reset entries for for that object, for the
        specified key if present, otherwise for all keys.

        If needed_only is set to True (the default), then no entry will be generated for a
        particular muid,key pair if the current value matches the value at the specified time.
        If needed_only is set to False, generates new entries for everything.

        If recursive is set to true, then will go and recursively update all entries
        in child objects that were referenced at to_time.
        """
        assert self and to_time and container and user_key and recursive
        raise NotImplementedError()
