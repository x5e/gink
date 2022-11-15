from sortedcontainers import SortedDict
from ChangeSetInfo import ChangeSetInfo
from typing import Tuple, Dict, Callable
from AbstractStore import AbstractStore

class MemoryStore(AbstractStore):
    _change_sets: SortedDict
    _chain_infos: Dict[Tuple[int,int], ChangeSetInfo]

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = dict()

    def add_commit(self, changeSetBytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        changeSetInfo = ChangeSetInfo(changeSetBytes=changeSetBytes)
        chain_key = (changeSetInfo.medallion, changeSetInfo.chain_start)
        seen_through = 0
        old_info = self._chain_infos.get(chain_key)
        if old_info:
            seen_through = old_info.timestamp
        if seen_through >= changeSetInfo.timestamp:
                return (changeSetInfo, False)
        if (changeSetInfo.prior_time or seen_through) and changeSetInfo.prior_time != seen_through:
                raise ValueError("change set received without prior link in chain")
        self._change_sets[changeSetInfo] = changeSetBytes
        self._chain_infos[chain_key] = changeSetInfo
        return (changeSetInfo, True)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        for key, value in self._change_sets.items():
            callback(value, key)
