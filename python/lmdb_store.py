"""Contains the LmdbStore class."""
from typing import Tuple, Callable
from struct import Struct
import lmdb
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker

class LmdbStore(AbstractStore):
    """ Stores change sets in an lmdb file."""
    _qq_struct = Struct(">QQ")
    _change_sets_db_name = "change_sets"
    _chain_infos_db_name = "chain_infos"

    def __init__(self, file_path):
        self.file_path = file_path
        self.env = lmdb.open(file_path, max_dbs=2, subdir=False)

    def close(self):
        self.env.close()

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        change_set_info = ChangeSetInfo(change_set_bytes=change_set_bytes)
        chain_key = self._qq_struct.pack(change_set_info.medallion, change_set_info.chain_start)
        # Note: LMDB supports only one write transaction, so we don't need to explicitly lock.
        with self.env.begin(write=True) as txn:
            seen_to = 0
            chain_value_old = txn.get(chain_key, db=self._chain_infos_db_name)
            if chain_value_old:
                seen_to = ChangeSetInfo(encoded=chain_value_old).timestamp
            if seen_to >= change_set_info.timestamp:
                return (change_set_info, False)
            if (change_set_info.prior_time or seen_to) and change_set_info.prior_time != seen_to:
                raise ValueError("change set received without prior link in chain")
            txn.put(bytes(change_set_info), change_set_bytes, db=self._change_sets_db_name)
            txn.put(chain_key, bytes(change_set_info), db=self._chain_infos_db_name)
            return (change_set_info, True)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        with self.env.begin() as txn:
            change_sets_cursor = txn.cursor(self._change_sets_db_name)
            data_remaining = change_sets_cursor.first()
            while data_remaining:
                info_bytes, change_set_bytes = change_sets_cursor.item()
                change_set_info = ChangeSetInfo(encoded=info_bytes)
                callback(change_set_bytes, change_set_info)
                data_remaining = change_sets_cursor.next()

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        with self.env.begin() as txn:
            infos_cursor = txn.cursor(self._chain_infos_db_name)
            data_remaining = infos_cursor.first()
            while data_remaining:
                info_bytes = infos_cursor.value()
                change_set_info = ChangeSetInfo(encoded=info_bytes)
                chain_tracker.mark_as_having(change_set_info)
                data_remaining = infos_cursor.next()
        return chain_tracker
