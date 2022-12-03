"""Contains the LmdbStore class."""

# Standard Python Stuff
from typing import Tuple, Callable, Iterable, Optional, List
from struct import Struct
import lmdb

# Protobuf Modules
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from key_pb2 import Key as KeyBuilder
from entry_pb2 import Entry as EntryBuilder

# Gink Implementation
from typedefs import MuTimestamp, Key
from tuples import Chain, EntryPair
from muid import Muid
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker


class LmdbStore(AbstractStore):
    """
    Uses lightning memory mapped files (lmdb) to implement the Store interface.

    Under the hood, each .gink.mdb file stores several b-trees:

        change_sets - Used to keep track of all commits we have seen.
            key: bytes(change_set_info), which forces sorting by (timestamp, medallion)
            val: the bytes for the relevant change set when it was sealed

        chain_infos - Used to keep track of how far along each chain we've seen.
            key: the tuple (medallion, chain_start), packed big endian
            val: bytes(change_set_info) for the last change set along the given chain

        claimed_chains - Used to keep track of which chains this store owns and can append to.
            key: medallion (packed big endian)
            val: chain_start (packed big endian)

        entries - Entry proto objects from commits, ordered in a way that can be accessed easily.
            key: (source-muid, entry-key, entry-muid, expiry), with muids packed into 16 byte form
            val: the binary serialization of the given entry
    """
    _qq_struct = Struct(">QQ")
    _q_struct = Struct(">Q")
    _change_sets_db_name = "change_sets".encode()
    _chain_infos_db_name = "chain_infos".encode()
    _claimed_chains_name = "claimed_map".encode()
    _entries_tbl_db_name = "entries_tbl".encode()
    _container_defs_name = "container_defs".encode()

    def __init__(self, file_path, reset=False):
        self.file_path = file_path
        self.env = lmdb.open(file_path, max_dbs=100, subdir=False)
        self._change_sets_db = self.env.open_db(self._chain_infos_db_name)
        self._chain_infos_db = self.env.open_db(self._change_sets_db_name)
        self._claimed_chains = self.env.open_db(self._claimed_chains_name)
        self._entries_tbl_db = self.env.open_db(self._entries_tbl_db_name)
        self._container_defs = self.env.open_db(self._container_defs_name)
        if reset:
            with self.env.begin(write=True) as txn:
                txn.drop(self._change_sets_db, delete=False)
                txn.drop(self._change_sets_db, delete=False)
                txn.drop(self._claimed_chains, delete=False)
                txn.drop(self._entries_tbl_db, delete=False)
                txn.drop(self._container_defs, delete=False)

    def close(self):
        self.env.close()

    def claim_chain(self, chain: Chain):
        with self.env.begin(write=True) as txn:
            key = self._q_struct.pack(chain.medallion)
            val = self._q_struct.pack(chain.chain_start)
            txn.put(key, val, db=self._claimed_chains)

    def get_claimed_chains(self) -> Iterable[Chain]:
        assert self
        raise NotImplementedError()

    def get_entry(self, container: Muid, key: Key, as_of: MuTimestamp) -> Optional[EntryPair]:
        """ Gets the entry for a given containing object with a given key at a given time."""
        key_builder = KeyBuilder()
        if isinstance(key, str):
            key_builder.characters = key  # type: ignore
        if isinstance(key, int):
            key_builder.number = key  # type: ignore
        built = key_builder.SerializeToString()  # type: ignore
        assert isinstance(key, (int, str)) or built == b""
        prefix = bytes(container) + built
        seek_after = prefix + bytes(Muid(as_of, 0, 0).invert())
        with self.env.begin() as txn:
            cursor = txn.cursor(self._entries_tbl_db)
            seek_succeded = cursor.set_range(seek_after)
            if not seek_succeded:
                # fell off the end of the b-tree
                return None
            bkey, bval = cursor.item()
            assert isinstance(bkey, bytes)
            if not bkey.startswith(prefix):
                return None  # moved onto a different key
            entry_builder = EntryBuilder()
            entry_builder.ParseFromString(bval) # type: ignore
            entry_muid = Muid.from_bytes(bkey[len(prefix):]).invert()
            return EntryPair(address=entry_muid, builder=entry_builder)

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[EntryPair]:
        """ gets all the active entries as of a particular time """
        container_prefix = bytes(container)
        time_bytes = bytes(Muid(as_of, 0, 0).invert())
        epoch_bytes = bytes(Muid(0,0,0).invert())
        result: List[EntryPair] = []
        with self.env.begin() as txn:
            cursor = txn.cursor(self._entries_tbl_db)
            seek_succeded = cursor.set_range(container_prefix)
            while seek_succeded:
                bkey = cursor.key()
                assert isinstance(bkey, bytes)
                if not bkey.startswith(container_prefix):
                    break
                key_without_entry_or_expiry = bkey[:-24]
                seek_succeded = cursor.set_range(key_without_entry_or_expiry + time_bytes)
                if not seek_succeded:
                    break
                bkey, bval = cursor.item()
                if not bkey.startswith(key_without_entry_or_expiry):
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(bval)  # type: ignore
                entry_muid = Muid.from_bytes(bkey[len(key_without_entry_or_expiry):]).invert()
                result.append(EntryPair(address=entry_muid, builder=entry_builder))
                seek_succeded = cursor.set_range(key_without_entry_or_expiry + epoch_bytes)
        return result


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
                for offset, change in builder.changes.items():   # type: ignore
                    if change.HasField("container"):
                        txn.put(bytes(Muid(new_info.timestamp, new_info.medallion, offset)),
                                change.container.SerializeToString(), db=self._container_defs)
                        continue
                    if change.HasField("entry"):
                        self._add_entry(new_info, txn, offset, change.entry)
                        continue
                    raise AssertionError(f"{repr(change.ListFields())} {offset} {new_info}")
        return (new_info, needed)

    def _add_entry(self, new_info, txn, offset, entry):
        user_key = b""
        if entry.HasField("key"):
            user_key = entry.key.SerializeToString()
        src_muid = Muid.create(entry.container, context=new_info)
        entry_muid = Muid.create(context=new_info, offset=offset)
        packed_expiry = self._q_struct.pack(entry.expiry)
        bkey = bytes(src_muid) + user_key + bytes(entry_muid.invert()) + packed_expiry
        txn.put(bkey, entry.SerializeToString(), db=self._entries_tbl_db)

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
