import lmdb
from ChangeSetInfo import ChangeSetInfo
from typing import Tuple, Callable, Iterable
from struct import Struct
from AbstractStore import AbstractStore

class LmdbStore(AbstractStore):
    _qq_struct = Struct(">QQ")
    _change_sets_db_name = "change_sets"
    _chain_infos_db_name = "chain_infos"

    def __init__(self, fn):
        self.fn = fn
        self.env = lmdb.open(fn, max_dbs=2, subdir=False)
    
    def close(self):
        self.env.close()

    def add_commit(self, changeSetBytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        changeSetInfo = ChangeSetInfo(changeSetBytes=changeSetBytes)
        chain_key = self._qq_struct.pack(changeSetInfo.medallion, changeSetInfo.chain_start)
        # Note: LMDB supports only one write transaction, so we don't need to explicitly lock the db.
        with self.env.begin(write=True) as txn:
            seen_through = 0
            chain_value_old = txn.get(chain_key, db=self._chain_infos_db_name)
            if chain_value_old:
                seen_through = ChangeSetInfo(encoded=chain_value_old).timestamp
            if seen_through >= changeSetInfo.timestamp:
                return (changeSetInfo, False)
            if (changeSetInfo.prior_time or seen_through) and changeSetInfo.prior_time != seen_through:
                raise ValueError("change set received without prior link in chain")
            txn.put(bytes(changeSetInfo), changeSetBytes, db=self._change_sets_db_name)
            txn.put(chain_key, bytes(changeSetInfo), db=self._chain_infos_db_name)
            return (changeSetInfo, True)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        with self.env.begin() as txn:
            change_sets_cursor = txn.cursor(self._change_sets_db_name)
            data_remaining = change_sets_cursor.first()
            while data_remaining:
                infoBytes, change_set_bytes = change_sets_cursor.item()
                change_set_info = ChangeSetInfo(encoded=infoBytes)
                callback(change_set_bytes, change_set_info)
                data_remaining = change_sets_cursor.next()

    def get_chain_infos(self) -> Iterable[ChangeSetInfo]:
        returning = list()
        with self.env.begin() as txn:
            infos_cursor = txn.cursor(self._chain_infos_db_name)
            data_remaining = infos_cursor.first()
            while data_remaining:
                infoBytes = infos_cursor.value()
                change_set_info = ChangeSetInfo(encoded=infoBytes)
                returning.append(change_set_info)
                data_remaining = infos_cursor.next()
        return returning
