"""
Defines the ChainTracker class.
"""

from typing import Union, Optional

from sortedcontainers import SortedDict  # type: ignore

from .builders import SyncMessage
from .typedefs import MuTimestamp, Medallion
from .muid import Muid
from .tuples import Chain
from .bundle_info import BundleInfo


class ChainTracker:
    """
    Keep track of what data a particular instance has.
    """

    _data: SortedDict  # [Chain, MuTimestamp]

    def __init__(self, sync_message: Optional[SyncMessage] = None):
        self._data = SortedDict()
        if isinstance(sync_message, SyncMessage):
            assert sync_message.HasField("greeting")
            greeting = sync_message.greeting  # type: ignore
            for greeting_entry in greeting.entries:
                chain = Chain(greeting_entry.medallion, greeting_entry.chain_start)
                self._data[chain] = greeting_entry.seen_through

    def get_seen_to(self, chain: Chain) -> Optional[MuTimestamp]:
        """ Says how far along a giving chain the given instance has seen. """
        return self._data.get(chain)

    def mark_as_having(self, bundle_info: BundleInfo):
        """ Indicates has everything along the chain in bundle_info up to its timestamp. """
        chain = bundle_info.get_chain()
        have_so_far = self._data.get(chain, 0)
        if have_so_far < bundle_info.timestamp:
            self._data[chain] = bundle_info.timestamp

    def has(self, what: Union[Muid, BundleInfo]) -> bool:
        """Reports if the instance tracked by this object has the given data. """
        if isinstance(what, BundleInfo):
            return what.timestamp <= self._data.get(what.get_chain(), 0)
        if isinstance(what, Muid):
            iterator = self._data.irange(
                minimum=Chain(Medallion(what.medallion), 0),
                maximum=Chain(Medallion(what.medallion), what.timestamp))
            for chain, seen_to in iterator:
                assert isinstance(chain, Chain)
                if chain.chain_start <= what.timestamp <= seen_to:
                    return True
            return False
        raise ValueError()

    def to_greeting_message(self) -> SyncMessage:
        """ Constructs a SyncMessage containing a Greeting with the tracked data.
            The entries will be sorted in [medallion, chain_start] order.
        """
        sync_message = SyncMessage()
        # pylint: disable=maybe-no-member
        sync_message.greeting.entries.append(SyncMessage.Greeting.GreetingEntry())  # type: ignore
        del sync_message.greeting.entries[0]  # type: ignore
        greeting = sync_message.greeting  # type: ignore
        assert len(greeting.entries) == 0
        for chain, seen_through in self._data.items():
            assert isinstance(chain, Chain), repr(self._data)
            entry = SyncMessage.Greeting.GreetingEntry()  # type: ignore
            entry.medallion = chain.medallion
            entry.chain_start = chain.chain_start
            entry.seen_through = seen_through
            greeting.entries.append(entry)  # pylint: disable=maybe-no-member # type: ignore
        return sync_message
