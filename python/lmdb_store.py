"""Contains the LmdbStore class."""
from typing import Tuple, Callable
from struct import Struct
import lmdb
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from change_set_pb2 import ChangeSet as ChangeSetBuilder

class LmdbStore(AbstractStore):
    """ Stores change sets in an lmdb file."""
    _qq_struct = Struct(">QQ")
    _change_sets_db_name = "change_sets".encode()
    _chain_infos_db_name = "chain_infos".encode()

    def __init__(self, file_path, reset=False):
        self.file_path = file_path
        self.env = lmdb.open(file_path, max_dbs=100, subdir=False)
        self._change_sets_db = self.env.open_db(self._chain_infos_db_name)
        self._chain_infos_db = self.env.open_db(self._change_sets_db_name)
        if reset:
            with self.env.begin(write=True) as txn:
                txn.drop(self._change_sets_db, delete=False)
                txn.drop(self._change_sets_db, delete=False)

    def close(self):
        self.env.close()

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        builder = ChangeSetBuilder()
        builder.ParseFromString(change_set_bytes)  # type: ignore
        new_info = ChangeSetInfo(builder=builder)
        chain_key = self._qq_struct.pack(new_info.medallion, new_info.chain_start)
        # Note: LMDB supports only one write transaction, so we don't need to explicitly lock.
        with self.env.begin(write=True) as txn:
            chain_value_old = txn.get(chain_key, db=self._chain_infos_db)
            old_info = ChangeSetInfo(encoded=chain_value_old) if chain_value_old else None
            needed = AbstractStore._is_needed(new_info, old_info)
            if needed:
                txn.put(bytes(new_info), change_set_bytes, db=self._change_sets_db)
                txn.put(chain_key, bytes(new_info), db=self._chain_infos_db)
        return (new_info, needed)

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        with self.env.begin() as txn:
            change_sets_cursor = txn.cursor(self._change_sets_db)
            data_remaining = change_sets_cursor.first()
            while data_remaining:
                info_bytes, change_set_bytes = change_sets_cursor.item()
                change_set_info = ChangeSetInfo(encoded=info_bytes)
                callback(change_set_bytes, change_set_info)
                data_remaining = change_sets_cursor.next()

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        with self.env.begin() as txn:
            infos_cursor = txn.cursor(self._chain_infos_db)
            data_remaining = infos_cursor.first()
            while data_remaining:
                info_bytes = infos_cursor.value()
                change_set_info = ChangeSetInfo(encoded=info_bytes)
                chain_tracker.mark_as_having(change_set_info)
                data_remaining = infos_cursor.next()
        return chain_tracker
