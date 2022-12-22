"""Contains AbstractStore class."""

# standard python modules
from typing import Tuple, Callable, Optional, Iterable, List, Union
from abc import ABC, abstractmethod

# protobuf builders
from change_pb2 import Change as ChangeBuilder
from entry_pb2 import Entry as EntryBuilder

# Gink specific modules
from change_set_info import ChangeSetInfo
from chain_tracker import ChainTracker
from typedefs import UserKey, MuTimestamp
from tuples import FoundEntry, Chain, PositionedEntry
from muid import Muid

class AbstractStore(ABC):
    """ abstract base class for the gink data store

        Stores both the change sets received as well as the contents of those
        change sets unpacked so that you can examine entries, container definitions, etc.
    """

    def __enter__(self):
        pass

    def __exit__(self, *_):
        self.close()

    @abstractmethod
    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        """ Gets all active entries for a given container as of the given time. """
        raise NotImplementedError()

    @abstractmethod
    def get_entry(self, container: Muid, key: Union[UserKey, Muid, None], 
            as_of: MuTimestamp) -> Optional[FoundEntry]:
        """ Gets the most recent entry for a given key at as_of
        """
        assert self and container and key and as_of
        raise NotImplementedError()
    
    @abstractmethod
    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int]=None, 
            offset: int=0, desc: bool=False) -> Iterable[PositionedEntry]:
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
    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        """ Adds data from a particular change set to this store.
            Returns: a tuple of the change set's info and boolean indicating if it was added
        """
        assert change_set_bytes and self
        raise NotImplementedError()

    @abstractmethod
    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        """ Calls the callback with each change set, in (timestamp, medallion) order.

            This is done callback style because we don't want to leave dangling transactions
            in the store, which could easily happen if we offered up an iterator interface instead.
        """
        assert callback and self
        raise NotImplementedError()

    def get_commit_infos(self) -> List[ChangeSetInfo]:
        """ Gets a list of change set infos; mostly for testing. """
        result = []
        def callback(_, info: ChangeSetInfo):
            result.append(info)
        self.get_commits(callback)
        return result

    @abstractmethod
    def get_chain_tracker(self) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
        assert self
        raise NotImplementedError()

    @staticmethod
    def _is_needed(new_info: ChangeSetInfo, old_info: Optional[ChangeSetInfo]) -> bool:
        seen_through = 0
        if old_info:
            assert old_info.get_chain() == new_info.get_chain()
            seen_through = old_info.timestamp
        if seen_through >= new_info.timestamp:
            return False
        if new_info.timestamp != new_info.chain_start and not new_info.prior_time:
            raise ValueError("Change set isn't the start but has no prior.")
        if (new_info.prior_time or seen_through) and new_info.prior_time != seen_through:
            raise ValueError("Change set received without prior link in chain!")
        return True

    def get_reset_changes(self, to_time, container: Optional[Muid], user_key: Optional[UserKey],
            recursive=False) -> Iterable[Union[ChangeBuilder, EntryBuilder]]:
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
