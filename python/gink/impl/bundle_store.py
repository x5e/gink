
from typing import *
from abc import ABC, abstractmethod

from .bundle_wrapper import BundleWrapper
from .tuples import Chain
from .typedefs import Limit
from .chain_tracker import ChainTracker
from .bundle_wrapper import BundleWrapper

class BundleStore(ABC):
    """ Abstract base class for the data store that would serve up data for multiple users. """

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

    @abstractmethod
    def get_bundles(
        self,
        callback: Callable[[BundleWrapper], None], *,
        peer_has: Optional[ChainTracker] = None,
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
    def get_chain_tracker(self, limit_to: Optional[Mapping[Chain, Limit]]=None) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
