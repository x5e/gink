import lmdb
from ChangeSetInfo import ChangeSetInfo
from typing import Tuple
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
