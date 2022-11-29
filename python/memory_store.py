""" Contains the MemoryStore class. """
from typing import Tuple, Callable
from sortedcontainers import SortedDict, SortedSet
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from change_set_pb2 import ChangeSet as ChangeSetBuilder

class MemoryStore(AbstractStore):
    """ "Persists" the data in memory.
        (Primarily for use in testing and to be used as a base clase.) """
    _change_sets: SortedDict  # ChangeSetInfo => bytes
    _chain_infos: SortedDict # Chain => ChangeSetInfo
    _claimed_chains: SortedSet # Chain

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = SortedDict()
        self._claimed_chains = SortedSet()

    def get_claimed_chains(self):
        return self._claimed_chains
    

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        change_set_builder = ChangeSetBuilder()
        change_set_builder.ParseFromString(change_set_bytes)  # type: ignore
        change_set_info = ChangeSetInfo(builder=change_set_builder)
        chain_key = change_set_info.get_chain()
        old_info = self._chain_infos.get(change_set_info.get_chain())
        needed = AbstractStore._is_needed(change_set_info, old_info)
        if needed:
            self._change_sets[change_set_info] = change_set_bytes
            self._chain_infos[chain_key] = change_set_info
        return (change_set_info, needed)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        for change_set_info, data in self._change_sets.items():
            assert isinstance(change_set_info, ChangeSetInfo)
            assert isinstance(data, bytes)
            callback(data, change_set_info)

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        for change_set_info in self._chain_infos.values():
            chain_tracker.mark_as_having(change_set_info)
        return chain_tracker
