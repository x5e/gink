"""
Contains the ChainTracker object.
"""

from typing import Union
from sync_message_pb2 import SyncMessage
from typedefs import Muid, Chain, ChainStart, MuTimestamp
from change_set_info import ChangeSetInfo
from sortedcontainers import SortedDict

class ChainTracker:
    """
    Keep track of what data a particular instance has.
    """

    _acked: SortedDict # [Chain, MuTimestamp]

    def __init__(self):
        self._acked = SortedDict()

    def mark_as_having(self, change_set_info: ChangeSetInfo):
        """Indicates has everything along the chain in change_set_info up to its timestamp."""
        chain = change_set_info.get_chain()
        have_so_far = self._acked.get(chain, 0)
        if have_so_far < change_set_info.timestamp:
            self._acked[chain] = change_set_info.timestamp

    def has(self, what: Union[Muid, ChangeSetInfo]) -> bool:
        """Reports if the instance tracked by this object has the given data. """
        if isinstance(what, ChangeSetInfo):
            return what.timestamp <= self._acked.get(what.get_chain(), 0)
        if isinstance(what, Muid):
            iterator = self._acked.irange(
                minimum=Chain(what.medallion, ChainStart(MuTimestamp(0))),
                maximum=Chain(what.medallion, ChainStart(what.timestamp)))
            for chain, seen_to in iterator:
                assert isinstance(chain, Chain)
                if what.timestamp >= chain.chain_start and what.timestamp <= seen_to:
                    return True
            return False
        raise ValueError()

    def to_greeting_message(self) -> SyncMessage:
        """ Constructs a SyncMessage containing a Greeting with the tracked data.
            The entries will be sorted in [medallion, chain_start] order.
        """
        sync_message = SyncMessage()
        greeting = getattr(sync_message, "greeting")
        for chain, seen_through in self._acked.items():
            assert isinstance(chain, Chain), repr(self._acked)
            entry = SyncMessage.Greeting.GreetingEntry()  # type: ignore
            entry.medallion = chain.medallion
            entry.chain_start = chain.chain_start
            entry.seen_through = seen_through
            greeting.entries.append(entry)  # pylint: disable=maybe-no-member # type: ignore
        return sync_message
