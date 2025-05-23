
from typing import *
from abc import ABC, abstractmethod

from pathlib import Path
from .tuples import Chain
from .typedefs import Limit, Medallion, MuTimestamp
from .has_map import HasMap
from .decomposition import Decomposition
from .watcher import Watcher


class BundleStore(ABC):
    """ Abstract base class for the data store that would serve up data for multiple users. """

    on_ready: Callable  # needs to by dynamically assigned

    @abstractmethod
    def apply_bundle(
            self,
            bundle: Union[Decomposition, bytes],
            callback: Optional[Callable[[Decomposition], None]]=None,
            claim_chain: bool=False) -> bool:
        """ Tries to add data from a particular bundle to this store.

            Returns true if the data is actually added, false if data already exists,
            and will throw an exception in the case of an invalid extension.
        """

    @abstractmethod
    def get_bundles(
        self,
        callback: Callable[[Decomposition], None], *,
        peer_has: Optional[HasMap] = None,
        limit_to: Optional[Mapping[Chain, Limit]] = None,
    ):
        """ Calls `callback` for all bunles stored,  limited to those designed by the `limit_to` (if present).

            Calls the callback with each bundle currently in the store.

            Calls in order received by this store, which may not correspond to the bundle creation times.
            But we still expect dependency order to be respected, that is if B1 references objects from B0,
            then B0 should come before B1.

            This is done callback style because we don't want to leave dangling transactions
            in the store, which could easily happen if we offered up an iterator interface instead.

            If the limit_to[chain] is x, then return all entries in that chain with timestamp <= x.

            The peer_has data can be used to optimize what the store is sending to only what the
            peer needs, but it can be ignored, and it's up to the callback to drop unneeded bundles.
        """

    @abstractmethod
    def get_one_bundle(self, timestamp: MuTimestamp, medallion: Medallion, *_) -> Optional[Decomposition]:
        """ Gives the contents of a bundle.  Intended to be used to analyze history. """

    @abstractmethod
    def get_has_map(self, limit_to: Optional[Mapping[Chain, Limit]]=None) -> HasMap:
        """Returns a tracker showing what this store has at the time this function is called."""

    @abstractmethod
    def _get_file_path(self) -> Optional[Path]:
        """ Return the underlying file name, or None if the store isn't file backed.
        """

    @abstractmethod
    def close(self):
        """ free resources """

    def is_closed(self) -> bool:
        """ Return true if closed """
        return False

    def is_selectable(self) -> bool:
        return self._get_watcher() is not None

    def _get_watcher(self) -> Optional[Watcher]:
        if not Watcher.supported():
            return None
        file_path = self._get_file_path()
        if file_path is None:
            return None
        if not hasattr(self, "_watcher"):
            setattr(self, "_watcher", Watcher(file_path))
        return getattr(self, "_watcher")

    def fileno(self) -> int:
        watcher = self._get_watcher()
        assert watcher is not None
        return watcher.fileno()

    def _clear_notifications(self):
        if hasattr(self, "_watcher"):
            self._watcher.clear()
