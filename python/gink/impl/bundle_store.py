
from typing import *
from abc import ABC, abstractmethod

from .bundle_wrapper import BundleWrapper
from .tuples import Chain
from .typedefs import MuTimestamp
from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo

BundleCallback = Callable[[bytes, BundleInfo], None]

class BundleStore(ABC):
    """ Abstract base class for the data store that would serve up data for multiple users. """

    @abstractmethod
    def apply_bundle(
            self,
            bundle: Union[BundleWrapper, bytes],
            callback: Optional[BundleCallback]=None,
            claim_chain: bool=False) -> bool:
        """ Tries to add data from a particular bundle to this store.

            Returns true if the data is actually added, false if data already exists,
            and will throw an exception in the case of an invalid extension.
        """

    @abstractmethod
    def get_bundles(
        self,
        callback: BundleCallback,
        filter: Optional[Mapping[Chain, MuTimestamp]]):
        """ Calls `callback` for all bunles stored,  limited to those designed by the filter (if present).

            If the filter[chain] => x, then return all entries in that chain with timestamp <= x.

            Gives everything if filter is None.  Filter value of -1 will be treated as infinity.
        """

    @abstractmethod
    def get_chain_tracker(self, filter: Optional[Mapping[Chain, MuTimestamp]]) -> ChainTracker:
        """Returns a tracker showing what this store has at the time this function is called."""
