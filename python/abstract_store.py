"""Contains AbstractStore class."""
from typing import Tuple, Callable, Optional as O, Iterable
from abc import ABC, abstractmethod
from change_set_info import ChangeSetInfo
from chain_tracker import ChainTracker
from typedefs import Chain

class AbstractStore(ABC):
    """abstract base class"""

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

    @abstractmethod
    def get_chain_tracker(self) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
        assert self
        raise NotImplementedError()

    @staticmethod
    def _is_needed(new_info: ChangeSetInfo, old_info: O[ChangeSetInfo]) -> bool:
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
