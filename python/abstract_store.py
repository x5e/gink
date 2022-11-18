"""Contains AbstractStore class."""
from typing import Tuple, Callable
from change_set_info import ChangeSetInfo
from chain_tracker import ChainTracker

class AbstractStore:
    """abstract base class"""

    def close(self):
        """Safely releases resources."""

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        """ Adds data from a particular change set to this store.
            Returns: a tuple of the change set's info and boolean indicating if it was added
        """
        assert change_set_bytes and self
        raise NotImplementedError()

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        """Calls the callback with each change set, in (timestamp, medallion) order."""
        assert callback and self
        raise NotImplementedError()

    def get_chain_tracker(self) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
        assert self
        raise NotImplementedError()
