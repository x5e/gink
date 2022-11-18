""" Contains the MemoryStore class. """
from typing import Tuple, Dict, Callable
from sortedcontainers import SortedDict
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from typedefs import Chain
from chain_tracker import ChainTracker

class MemoryStore(AbstractStore):
    """ "Persists" the data in memory.
        (Primarily for use in testing and to be used as a base clase.) """
    _change_sets: SortedDict
    _chain_infos: Dict[Chain, ChangeSetInfo]

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = {}

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        change_set_info = ChangeSetInfo(change_set_bytes=change_set_bytes)
        seen_through = 0
        chain_key = change_set_info.get_chain()
        old_info = self._chain_infos.get(change_set_info.get_chain())
        if old_info:
            seen_through = old_info.timestamp
        if seen_through >= change_set_info.timestamp:
            return (change_set_info, False)
        if (change_set_info.prior_time or seen_through):
            if change_set_info.prior_time != seen_through:
                raise ValueError("change set received without prior link in chain")
        self._change_sets[change_set_info] = change_set_bytes
        self._chain_infos[chain_key] = change_set_info
        return (change_set_info, True)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        for key, value in self._change_sets.items():
            callback(value, key)

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        for change_set_info in self._chain_infos.values():
            chain_tracker.mark_as_having(change_set_info)
        return chain_tracker
