"""Contains the LmdbStore class."""

# Standard Python Stuff
from typing import Tuple, Callable, Iterable, Optional, List, Union
from struct import Struct
import lmdb

# Protobuf Modules
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_pb2 import Change as ChangeBuilder
from entry_pb2 import Entry as EntryBuilder
from container_pb2 import Container as ContainerBuilder
from behavior_pb2 import Behavior

# Gink Implementation
from typedefs import MuTimestamp, UserKey
from tuples import Chain, EntryAddressAndBuilder
from muid import Muid
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from code_values import (encode_key, create_deleting_entry, EntryStorageKeyAndVal, 
    entries_equiv, EntryStorageKey, encode_int)

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

        entries_tbl - Entry proto data from commits, ordered in a way that can be accessed easily.
            key: (source-muid, middle-key, entry-muid, expiry), with muids packed into 16 bytes
            val: binaryproto of the entry
            A couple of other wrinkles of note:
                * The entry-key will be the KeyBuilder serialized in the container is a directory.
                * In the case of a QUEUE, the entry-key will be (effective-time, move-muid?), where 
                  the move-muid is only present in the case of a move.

        unenter_tbl - Used to move or soft delete things in the entries_tbl
            key: (container-muid, eff-ts, inv-move/entry-muid, inv-exit-muid, dest-ts)
            val: binaryproto of the exit
        
        entries_loc - table used as an index to look-up entries by entry-muid

        container_defs - Map from muid to serialized containers definitions.
    """
    _change_sets_db_name = "change_sets".encode()
    _chain_infos_db_name = "chain_infos".encode()
    _claimed_chains_name = "claimed_map".encode()
    _entries_tbl_db_name = "entries_tbl".encode()
    _unenter_tbl_db_name = "unenter_tbl".encode()
    _container_defs_name = "container_defs".encode()

    def __init__(self, file_path, reset=False):
        self.file_path = file_path
        self.env = lmdb.open(file_path, max_dbs=100, subdir=False)
        self._change_sets_db = self.env.open_db(self._chain_infos_db_name)
        self._chain_infos_db = self.env.open_db(self._change_sets_db_name)
        self._claimed_chains = self.env.open_db(self._claimed_chains_name)
        self._entries_tbl_db = self.env.open_db(self._entries_tbl_db_name)
        self._unenter_tbl_db = self.env.open_db(self._unenter_tbl_db_name)
        self._container_defs = self.env.open_db(self._container_defs_name)
        if reset:
            with self.env.begin(write=True) as txn:
                txn.drop(self._change_sets_db, delete=False)
                txn.drop(self._change_sets_db, delete=False)
                txn.drop(self._claimed_chains, delete=False)
                txn.drop(self._entries_tbl_db, delete=False)
                txn.drop(self._container_defs, delete=False)

    def get_reset_changes(self, to_time, container: Optional[Muid], user_key: Optional[UserKey],
            recursive=True) -> Iterable[Union[ChangeBuilder, EntryBuilder]]:
        if container is None and user_key is not None:
            raise ValueError("can't specify key without muid")
        if container is None:
            recursive = False
        seen = set() if recursive else None
        with self.env.begin() as txn:
            entries_cursor = txn.cursor(self._entries_tbl_db)
            if container is None or container.timestamp > 0:
                containers_cursor = txn.cursor(self._container_defs)
                if container:
                    move_succeeded = containers_cursor.set_key(bytes(container))
                else:
                    move_succeeded = containers_cursor.first()
                while move_succeeded:
                    muid = Muid.from_bytes(containers_cursor.key())
                    if muid.timestamp > to_time:
                        break # don't bother with containers created after to_time
                    container_builder = ContainerBuilder()
                    container_builder.ParseFromString(containers_cursor.value())
                    if container_builder.behavior == Behavior.SCHEMA:
                        for entry_builder in LmdbStore._get_dir_reset_entries(
                                container, seen, user_key, entries_cursor, to_time):
                            yield entry_builder
                    else:
                        raise NotImplementedError(f"don't know how to reset {muid}")
                    if container:
                        break
                    move_succeeded = containers_cursor.next()
            global_directory = Muid(-1, -1, Behavior.SCHEMA)
            if container is None or container == global_directory:
                for entry_builder in LmdbStore._get_dir_reset_entries(
                        global_directory, seen, user_key, entries_cursor, to_time):
                            yield entry_builder


    @staticmethod
    def _grok_entry(entries_cursor) -> EntryStorageKeyAndVal:
        key_as_bytes, value_as_bytes = entries_cursor.item()
        parsed_key = EntryStorageKey.from_bytes(key_as_bytes)
        entry_builder = EntryBuilder()
        entry_builder.ParseFromString(value_as_bytes) # type: ignore
        return EntryStorageKeyAndVal(parsed_key, entry_builder)

    # TODO: add a seek(lmdb_cursor, minimum, maximum) method to simplify the _helper

    @staticmethod
    def _get_dir_reset_entries(container: Muid, seen, user_key, entries_cursor, 
            to_time) -> Iterable[EntryBuilder]:
        if seen is not None:
            if container in seen:
                return
            seen.add(container)
        serialized_user_key = bytes()
        if user_key is not None:
            serialized_user_key = encode_key(user_key).SerializeToString() # type: ignore
        seek_succeeded = entries_cursor.set_range(bytes(container) + serialized_user_key)
        while seek_succeeded:

            now = LmdbStore._grok_entry(entries_cursor)
            if now.key.container != container or (user_key and now.key.middle_key != user_key):
                break
            entry_since_time_to = False
            if now.key.entry_muid.timestamp > to_time:
                entry_since_time_to = True
                seek_succeeded = entries_cursor.set_range(bytes(now.key.replace_time(to_time)))
                if not seek_succeeded:
                    # fell off end of table, so nothing existed at to_time
                    yield create_deleting_entry(container, now.key.middle_key)
                    # TODO: check if last now.builder is deleting and skip deleting entry if so
                    break # nothing left in table to worry about

            then = LmdbStore._grok_entry(entries_cursor)

            if then.key.container != container or then.key.middle_key != now.key.middle_key:
                # on to something different, so nothing existed at to_time
                yield create_deleting_entry(container, now.key.middle_key)
                # TODO: check if last now.builder is deleting and skip deleting entry if so
                if then.key.container != container:
                    break
                continue

            if entry_since_time_to and not entries_equiv(then, now):
                yield then.builder
            if seen is not None and then.builder.HasField("pointee"): # type: ignore
                child_muid = Muid.create(getattr(then.builder, "pointee"), then.key.container)
                for _ in LmdbStore._get_dir_reset_entries(child_muid, seen, user_key, entries_cursor, to_time):
                    yield _
            seek_succeeded = entries_cursor.set_range(bytes(now.key.replace_time(0)))



    def close(self):
        self.env.close()

    def claim_chain(self, chain: Chain):
        with self.env.begin(write=True) as txn:
            key = encode_int(chain.medallion)
            val = encode_int(chain.chain_start)
            txn.put(key, val, db=self._claimed_chains)

    def get_claimed_chains(self) -> Iterable[Chain]:
        assert self
        raise NotImplementedError()

    
    @staticmethod
    def _seek(cursor, prefix: Optional[bytes]=None, after: Optional[bytes]=None) -> bool:
        assert prefix or after
        seek_gt_eq_to_prefix = cursor.set_range(after or prefix)
        if not seek_gt_eq_to_prefix:
            # nothing in the table exists at or after seek location
            return False
        key = cursor.key()
        if prefix and not key.startswith(prefix):
            return False
        return True
        

    def get_entry(self, container: Muid, key: UserKey, as_of: MuTimestamp) -> Optional[EntryAddressAndBuilder]:
        """ Gets the entry for a given containing object with a given key at a given time."""
        built = encode_key(key).SerializeToString() if key is not None else b"" # type: ignore
        assert isinstance(key, (int, str)) or built == b""
        prefix = bytes(container) + built
        seek_after = prefix + bytes(Muid(as_of, 0, 0).invert())
        with self.env.begin() as txn:
            cursor = txn.cursor(self._entries_tbl_db)
            seek_succeded = LmdbStore._seek(cursor, prefix, after=seek_after)
            if not seek_succeded:
                return None
            bkey, bval = cursor.item()
            assert isinstance(bkey, bytes)
            entry_builder = EntryBuilder()
            entry_builder.ParseFromString(bval) # type: ignore
            entry_muid = Muid.from_bytes(bkey[len(prefix):]).invert()
            return EntryAddressAndBuilder(address=entry_muid, builder=entry_builder)

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[EntryAddressAndBuilder]:
        """ gets all the active entries as of a particular time """
        container_prefix = bytes(container)
        time_bytes = bytes(Muid(as_of, 0, 0).invert())
        epoch_bytes = bytes(Muid(0,0,0).invert())
        result: List[EntryAddressAndBuilder] = []
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
                result.append(EntryAddressAndBuilder(address=entry_muid, builder=entry_builder))
                seek_succeded = cursor.set_range(key_without_entry_or_expiry + epoch_bytes)
        return result


    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        builder = ChangeSetBuilder()
        builder.ParseFromString(change_set_bytes)  # type: ignore
        new_info = ChangeSetInfo(builder=builder)
        chain_key = encode_int(new_info.medallion) + encode_int(new_info.chain_start)
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
        packed_expiry = encode_int(entry.expiry)
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
