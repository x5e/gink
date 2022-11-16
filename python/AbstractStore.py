from ChangeSetInfo import ChangeSetInfo
from typing import Tuple, Callable, Iterable

class AbstractStore(object):

    def close(self):
        pass

    def add_commit(self, changeSetBytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        assert changeSetBytes
        raise NotImplemented()

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        assert callback
        raise NotImplemented()

    def get_chain_infos(self) -> Iterable[ChangeSetInfo]:
        raise NotImplemented()
