"""Contains the LmdbStore class."""

# Standard Python Stuff
from typing import Tuple, Callable, Iterable, Optional, List, Union
from struct import pack
from lmdb import open as ldmbopen, Transaction as Trxn, Cursor

# Protobuf Modules
from ..builders.bundle_pb2 import Bundle as BundleBuilder
from ..builders.change_pb2 import Change as ChangeBuilder
from ..builders.entry_pb2 import Entry as EntryBuilder
from ..builders.movement_pb2 import Movement
from ..builders.container_pb2 import Container as ContainerBuilder
from ..builders.behavior_pb2 import Behavior

# Gink Implementation
from .typedefs import MuTimestamp, UserKey
from .tuples import Chain, FoundEntry, PositionedEntry
from .muid import Muid
from .bundle_info import BundleInfo
from .abstract_store import AbstractStore
from .chain_tracker import ChainTracker
from .coding import (encode_key, create_deleting_entry, EntryStoragePair, decode_muts,
    entries_equiv, EntryStorageKey, encode_muts, QueueMiddleKey, SCHEMA, QUEUE, serialize)

class LmdbStore(AbstractStore):
    """
    Uses the Lightning Memory Mapped Database (lmdb) to implement the Store interface.

    Under the hood, each gink.mdb file stores several b-trees:

        bundles - Used to keep track of all commits we have seen.
            key: bytes(bundle_info), which forces sorting by (timestamp, medallion)
            val: the bytes for the relevant bundle when it was sealed

        chains - Used to keep track of how far along each chain we've seen.
            key: the tuple (medallion, chain_start), packed big endian
            val: bytes(bundle_info) for the last bundle along the given chain

        claims - Used to keep track of which chains this store owns and can append to.
            key: medallion (packed big endian)
            val: chain_start (packed big endian)

        entries - Entry proto data from commits, ordered in a way that can be accessed easily.
            key: (source-muid, middle-key, entry-muid, expiry), with muids packed into 16 bytes
            val: binaryproto of the entry
            A couple of other wrinkles of note:
                * The middle-key will be binaryproto of the key if the container is a directory.
                * In the case of a QUEUE, the middle-key will be (effective-time, move-muid?), where 
                  the move-muid is only present in the case of a move.

        removals - Used to soft delete items from the entries table.
            Designed so that the first 40 bytes matches the first 40 bytes of the entries key.
            When removed to a different position and retaining history, the old entry stays,
            with the removal signaling a soft delete, and a new entry is added to the entries table.
            And the entries location table is updated with the new location of that entry.
            key: (container-muid, eff-ts, inv-move/entry-muid, removal-muid)
            val: binaryproto of the movement
        
        locations - table used as an index to look-up entries by entry-muid for (re)-moving
            key: (entry-muid, inv-placement MuTimestamp)
            val: key from the entries table

        containers - Map from muid to serialized containers definitions.

        retentions - Keeps track of what history is being stored.
            key: one of b"bundles", b"entries"
            val: Big endian encoded int64.
                0 - No history stored.
                1 - All history stored.
                <other microsecond timestamp> - time since when history has been retained
    """

    def __init__(self, file_path, reset=False, retain_bundles=True, retain_entries=True):
        """ Opens a gink.mdb file for use as a Store.

            file_path: where find or place the data file
            reset: if True and file exists, will wipe it after opening
            retain_bundles: if not already set in this file, will specify bundle retention
            retain_entries: if not already set in this file, will specify entry retention
        """
        self.file_path = file_path
        self._handle = ldmbopen(file_path, max_dbs=100, subdir=False)
        self._bundles = self._handle.open_db(b"bundles")
        self._chains = self._handle.open_db(b"chains")
        self._claims = self._handle.open_db(b"claims")
        self._entries = self._handle.open_db(b"entries")
        self._removals = self._handle.open_db(b"removals")
        self._containers = self._handle.open_db(b"containers")
        self._locations = self._handle.open_db(b"locations")
        self._retentions = self._handle.open_db(b"retentions")
        if reset:
            with self._handle.begin(write=True) as txn:
                # The delete=False signals to lmdb to truncate the tables rather than drop them
                txn.drop(self._bundles, delete=False)
                txn.drop(self._chains, delete=False)
                txn.drop(self._claims, delete=False)
                txn.drop(self._entries, delete=False)
                txn.drop(self._removals, delete=False)
                txn.drop(self._containers, delete=False)
                txn.drop(self._locations, delete=False)
                txn.drop(self._retentions, delete=False)
        with self._handle.begin() as txn:
            # I'm checking to see if retentions are set in a read-only transaction, because if
            # they are and another process has this file open I don't want to wait to get a lock.
            # (lmdb only allows for one writing transaction)
            retentions_set = txn.get(b"bundles", db=self._retentions) is not None
        if not retentions_set:
            with self._handle.begin(write=True) as txn:
                # check again now that I have the write lock to avoid a race condition
                retentions_set = txn.get(b"bundles", db=self._retentions) is not None
                if not retentions_set:
                    txn.put(b"bundles", encode_muts(int(retain_bundles)), db=self._retentions)
                    txn.put(b"entries", encode_muts(int(retain_entries)), db=self._retentions)
        

    def get_reset_changes(self, to_time, container: Optional[Muid], user_key: Optional[UserKey],
            recursive=True) -> Iterable[Union[ChangeBuilder, EntryBuilder]]:
        if container is None and user_key is not None:
            raise ValueError("can't specify key without muid")
        if container is None:
            recursive = False
        seen = set() if recursive else None
        with self._handle.begin() as txn:
            entries_cursor = txn.cursor(self._entries)
            if container is None or container.timestamp > 0:
                containers_cursor = txn.cursor(self._containers)
                if container:
                    move_succeeded = containers_cursor.set_key(bytes(container))
                else:
                    move_succeeded = containers_cursor.first()
                while move_succeeded:
                    muid = Muid.from_bytes(containers_cursor.key())
                    if muid.timestamp > to_time:
                        break # don't bother with containers created after to_time
                    container_builder = ContainerBuilder()
                    container_builder.ParseFromString(containers_cursor.value()) # type: ignore
                    if container_builder.behavior == Behavior.SCHEMA: # type: ignore
                        for entry_builder in LmdbStore._get_dir_reset_entries(
                                muid, seen, user_key, entries_cursor, to_time):
                            yield entry_builder
                    else:
                        raise NotImplementedError(f"don't know how to reset {muid}")
                    if container:
                        break
                    move_succeeded = containers_cursor.next()
            global_directory = Muid(-1, -1, Behavior.SCHEMA) # type: ignore
            if container is None or container == global_directory:
                for entry_builder in LmdbStore._get_dir_reset_entries(
                        global_directory, seen, user_key, entries_cursor, to_time):
                            yield entry_builder


    @staticmethod
    def _grok_entry(entries_cursor, behavior: int) -> EntryStoragePair:
        key_as_bytes, value_as_bytes = entries_cursor.item()
        parsed_key = EntryStorageKey.from_bytes(key_as_bytes, behavior)
        entry_builder = EntryBuilder()
        entry_builder.ParseFromString(value_as_bytes) # type: ignore
        return EntryStoragePair(parsed_key, entry_builder)

    @staticmethod
    def _get_dir_reset_entries(container: Muid, seen, user_key, entries_cursor, 
            to_time) -> Iterable[EntryBuilder]:
        raise NotImplementedError()
        if seen is not None:
            if container in seen:
                return
            seen.add(container)
        serialized_user_key = bytes()
        if user_key is not None:
            serialized_user_key = serialize(encode_key(user_key))
        seek_succeeded = entries_cursor.set_range(bytes(container) + serialized_user_key)
        while seek_succeeded:
            now = LmdbStore._grok_entry(entries_cursor, SCHEMA)
            now_middle_key = now.key.middle_key
            assert isinstance(now_middle_key, (int, str))
            if now.key.container != container or (user_key and now.key.middle_key != user_key):
                break
            entry_since_time_to = False
            if now.key.entry_muid.timestamp > to_time:
                entry_since_time_to = True
                seek_succeeded = entries_cursor.set_range(bytes(now.key.replace_time(to_time)))
                if not seek_succeeded:
                    # fell off end of table, so nothing existed at to_time
                    yield create_deleting_entry(container, now_middle_key)
                    # TODO: check if last now.builder is deleting and skip deleting entry if so
                    break # nothing left in table to worry about
            then = LmdbStore._grok_entry(entries_cursor, SCHEMA)

            if then.key.container != container or then.key.middle_key != now.key.middle_key:
                # on to something different, so nothing existed at to_time
                yield create_deleting_entry(container, now_middle_key)
                # TODO: check if last now.builder is deleting and skip deleting entry if so
                if then.key.container != container:
                    break
                continue

            if entry_since_time_to and not entries_equiv(then, now):
                yield then.builder
            if seen is not None and then.builder.HasField("pointee"): # type: ignore
                child_muid = Muid.create(getattr(then.builder, "pointee"), then.key.container)
                for _ in LmdbStore._get_dir_reset_entries(child_muid, seen, user_key, 
                        entries_cursor, to_time):
                    yield _
            seek_succeeded = entries_cursor.set_range(bytes(now.key.replace_time(0)))

    def close(self):
        self._handle.close()

    def claim_chain(self, chain: Chain):
        with self._handle.begin(write=True) as txn:
            key = encode_muts(chain.medallion)
            val = encode_muts(chain.chain_start)
            txn.put(key, val, db=self._claims)

    def get_claimed_chains(self) -> Iterable[Chain]:
        assert self
        raise NotImplementedError()

    def _get_queue_entry(self, txn, entry_muid: Muid, as_of: int=-1) -> Optional[EntryStoragePair]:
        loc_cursor = txn.cursor(self._locations)
        found = LmdbStore._seek(loc_cursor, bytes(entry_muid), serialize(as_of))
        if not found:
            return None
        entries_key = loc_cursor.value()
        if len(entries_key) == 0:
            return None
        entries_cursor = txn.cursor(self._entries)
        found = entries_cursor.set_key(entries_key)
        assert found, "the locations table lied to me"
        return LmdbStore._grok_entry(entries_cursor, QUEUE)

    def get_entry(self, container: Muid, key: Union[None, UserKey, Muid],
            as_of: MuTimestamp=-1) -> Optional[FoundEntry]:
        """ Gets a single entry (or none if nothing in the database matches).

        When "key" is None, assumes that the container is a box and returns the most
        recent entry for "container" written before the as_of time.

        When "key" is a UserKey (i.e. str or int) then assumes that "container" is a 
        directory, so grabs the latest value written for that key by the given time.

        When "key" is a Muid, assumes that "container" is a queue and that the "key"
        is the muid for the desired entry.
        """
        with self._handle.begin() as txn:
            entries_cursor = txn.cursor(self._entries)
            if isinstance(key, Muid):
                storage_pair = self._get_queue_entry(txn, key, as_of=as_of)
                if not storage_pair:
                    return None
                return FoundEntry(storage_pair.key.entry_muid, storage_pair.builder)
                
            built = serialize(encode_key(key)) if isinstance(key, (int, str)) else b""
            assert isinstance(key, (int, str)) or built == b""
            prefix = bytes(container) + built
            seek_succeded = LmdbStore._seek(entries_cursor, prefix, bytes(Muid(as_of, 0, 0)))
            if not seek_succeded:
                return None
            bkey, bval = entries_cursor.item()
            assert isinstance(bkey, bytes)
            entry_builder = EntryBuilder()
            entry_builder.ParseFromString(bval) # type: ignore
            entry_storage_key = EntryStorageKey.from_bytes(bkey, SCHEMA)
            return FoundEntry(entry_storage_key.entry_muid, builder=entry_builder)

    @staticmethod
    def _seek(cursor: Cursor, prefix: bytes, suffix: bytes=b"\xFF"*40) -> Optional[bytes]:
        """ Positions the cursor on the last entry with prefix before prefix+suffix.

            Returns the key under the cursor when something is found, None otherwise.
            If no match is found, the new position of the cursor is undefined.
        """
        boundary = prefix + suffix
        key = None
        # first try seeking to an item immediately after prefix+suffix
        if cursor.set_range(boundary):
            # then move to the item before that
            if cursor.prev():
                key = cursor.key()
        else:
            # if there isn't anything after that then just go to the end of the table
            if cursor.last():
                key = cursor.key()
        return key if key and key.startswith(prefix) else None
    
    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int]=None, 
            offset: int=0, desc: bool=False) -> Iterable[PositionedEntry]:
        prefix = bytes(container)
        with self._handle.begin() as txn:
            entries_cursor = txn.cursor(self._entries)
            removal_cursor = txn.cursor(self._removals)
            if desc:
                placed = LmdbStore._seek(entries_cursor, prefix)
            else:
                placed = entries_cursor.set_range(prefix)
            while placed and (limit is None or limit > 0):
                entries_key = entries_cursor.key()
                if not entries_key.startswith(prefix):
                    break # moved onto entries for another container
                parsed_key = EntryStorageKey.from_bytes(entries_key, Behavior.QUEUE) # type: ignore
                middle_key = parsed_key.middle_key
                assert isinstance(middle_key, QueueMiddleKey)
                if middle_key.effective_time > as_of:
                    if desc:
                        entries_cursor.prev()
                        continue
                    else:
                        break # times will only increase
                if parsed_key.get_placed_time() > as_of:
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue # this was put here after when I'm looking
                if parsed_key.expiry and (parsed_key.expiry < as_of):
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue # this entry has expired by the as_of time
                found_removal = LmdbStore._seek(removal_cursor, prefix=entries_key[0:40])
                if found_removal and Muid.from_bytes(found_removal[40:]).timestamp < as_of:
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue  # this entry at this position was (re)moved by this time
                # If we got here, then we know the entry is active at the as_of time.
                if offset > 0:
                    offset -= 1
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(entries_cursor.value()) # type: ignore
                yield PositionedEntry(
                    position=middle_key.effective_time, 
                    positioner=middle_key.movement_muid or parsed_key.entry_muid,
                    entry_muid=parsed_key.entry_muid,
                    entry_data=entry_builder)
                if limit is not None:
                    limit -= 1
                placed = entries_cursor.prev() if desc else entries_cursor.next()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        """ gets all the active entries in a direcotry as of a particular time """
        container_prefix = bytes(container)
        as_of_bytes = bytes(Muid(as_of, 0, 0))
        with self._handle.begin() as txn:
            cursor = txn.cursor(self._entries)
            cursor_key = self._seek(cursor, container_prefix)
            while cursor_key:
                entry_storage_key = EntryStorageKey.from_bytes(cursor_key)
                if entry_storage_key.entry_muid.timestamp > as_of:
                    # we've found a key, but the entry is too new, so look for an older one
                    through_middle = cursor_key[:-24]
                    cursor_key = self._seek(cursor, through_middle, as_of_bytes)
                    if cursor_key:
                        entry_storage_key = EntryStorageKey.from_bytes(cursor_key)
                    else:
                        # no entries for this key before the as-of time, go to next key
                        cursor_key = self._seek(cursor, container_prefix, cursor_key[16:-24])
                        continue
                if entry_storage_key.expiry and entry_storage_key.expiry < as_of:
                    cursor_key = self._seek(cursor, container_prefix, cursor_key[16:-24])
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(cursor.value())  # type: ignore
                yield FoundEntry(address=entry_storage_key.entry_muid, builder=entry_builder)
                cursor_key = self._seek(cursor, container_prefix, cursor_key[16:-24])

    def get_all_entry_keys(self):
        print("get_all_entries")
        with self._handle.begin() as txn:
            cursor = txn.cursor(self._entries)
            succeeded = cursor.first()
            while succeeded:
                yield EntryStorageKey.from_bytes(cursor.key())
                succeeded = cursor.next()

    def apply_bundle(self, bundle_bytes: bytes) -> Tuple[BundleInfo, bool]:
        builder = BundleBuilder()
        builder.ParseFromString(bundle_bytes)  # type: ignore
        new_info = BundleInfo(builder=builder)
        chain_key = pack(">QQ", new_info.medallion, new_info.chain_start)
        # Note: LMDB supports only one write transaction, so we don't need to explicitly lock.
        with self._handle.begin(write=True) as trxn:
            chain_value_old = trxn.get(chain_key, db=self._chains)
            old_info = BundleInfo(encoded=chain_value_old) if chain_value_old else None
            needed = AbstractStore._is_needed(new_info, old_info)
            if needed:
                if decode_muts(trxn.get(b"bundles", db=self._retentions)):
                    trxn.put(bytes(new_info), bundle_bytes, db=self._bundles)
                trxn.put(chain_key, bytes(new_info), db=self._chains)
                for offset, change in builder.changes.items():   # type: ignore
                    if change.HasField("container"):
                        trxn.put(bytes(Muid(new_info.timestamp, new_info.medallion, offset)),
                                change.container.SerializeToString(), db=self._containers)
                        continue
                    if change.HasField("entry"):
                        self._add_entry(new_info, trxn, offset, change.entry)
                        continue
                    if change.HasField("movement"):
                        self._apply_movement(new_info, trxn, offset, change.movement)
                        continue
                    raise AssertionError(f"{repr(change.ListFields())} {offset} {new_info}")
        return (new_info, needed)
    
    def _apply_movement(self, new_info: BundleInfo, txn: Trxn, offset: int, builder: Movement):
        """ (Re)moves an entry from the store.

            Will be via a soft delete if retaining entry history or a hard delete if not.
        """
        retaining = bool(decode_muts(txn.get(b"entries", db=self._retentions))) # type: ignore
        container = Muid.create(getattr(builder, "container"), context=new_info)
        entry_muid = Muid.create(getattr(builder, "entry"), context=new_info)
        movement_muid = Muid.create(context=new_info, offset=offset)
        dest = getattr(builder, "dest")
        locations_cursor = txn.cursor(self._locations)
        existing_location_key = LmdbStore._seek(locations_cursor, bytes(entry_muid))
        if not existing_location_key:
            return None # can't move something I don't know about
        existing_location_time = decode_muts(existing_location_key[-8:])
        assert existing_location_time is not None
        if existing_location_time > movement_muid.timestamp:
            # I'm intentionally ignoring the case where a past (re)move shows up after a later one.
            # This means that while the present state will always converge, the history might not.
            return
        existing_location_value = locations_cursor.value()
        if len(existing_location_value) == 0:
            return None # already has been deleted
        entries_cursor = txn.cursor(self._entries)
        existing_entry_found = entries_cursor.set_key(existing_location_value)
        assert existing_entry_found, "the locations table lied to me"
        storage_pair = LmdbStore._grok_entry(entries_cursor, QUEUE)
        entry_expiry = storage_pair.key.expiry
        if entry_expiry and movement_muid.timestamp > entry_expiry:
            return # refuse to move a entry that's already expired
        if retaining:
            # only keep the removal info if doing a soft delete, otherwise just nuke the entry
            removal_key = bytes(storage_pair.key)[0:40] + bytes(movement_muid)
            removal_val = serialize(builder)
            txn.put(removal_key, removal_val, db=self._removals)
        new_location_key = bytes(entry_muid) + serialize(movement_muid.timestamp)
        if dest:
            middle_key = QueueMiddleKey(dest, movement_muid)
            entry_storage_key = EntryStorageKey(container, middle_key, entry_muid, entry_expiry)
            serialized_esk = bytes(entry_storage_key)
            txn.put(serialized_esk, serialize(storage_pair.builder), db=self._entries)
            txn.put(new_location_key, serialized_esk, db=self._locations)
        elif retaining:
            txn.put(new_location_key, b"", db=self._locations)
        if not retaining:
            # remove the entry at the old location, and the old location entry
            txn.delete(existing_location_value, db=self._entries)
            txn.delete(existing_location_key, db=self._locations)
            

    def _add_entry(self, new_info: BundleInfo, txn: Trxn, offset: int, builder: EntryBuilder):
        entry_storage_key = EntryStorageKey.from_builder(builder, new_info, offset)
        serialized_esk = bytes(entry_storage_key)
        if builder.behavior in (Behavior.SCHEMA, Behavior.BOX): # type: ignore
            if not decode_muts(bytes(txn.get(b"entries", db=self._retentions))): # type: ignore
                raise NotImplementedError("need to implement deleting old entries")
        txn.put(serialized_esk, serialize(builder), db=self._entries)
        entry_muid = entry_storage_key.entry_muid
        entries_loc_key = bytes(entry_muid) + serialize(entry_muid.timestamp)
        txn.put(entries_loc_key, serialized_esk, db=self._locations)

    def get_bundles(self, callback: Callable[[bytes, BundleInfo], None], since: MuTimestamp=0):
        with self._handle.begin() as txn:
            retention = decode_muts(txn.get(b"bundles", db=self._retentions))
            if retention is None or (retention != 1 and retention > since):
                raise ValueError("haven't been retaining bundles that long")
            bundles_cursor = txn.cursor(self._bundles)
            data_remaining = bundles_cursor.set_range(encode_muts(since))
            while data_remaining:
                info_bytes, bundle_bytes = bundles_cursor.item()
                bundle_info = BundleInfo(encoded=info_bytes)
                callback(bundle_bytes, bundle_info)
                data_remaining = bundles_cursor.next()

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        with self._handle.begin() as txn:
            infos_cursor = txn.cursor(self._chains)
            data_remaining = infos_cursor.first()
            while data_remaining:
                info_bytes = infos_cursor.value()
                bundle_info = BundleInfo(encoded=info_bytes)
                chain_tracker.mark_as_having(bundle_info)
                data_remaining = infos_cursor.next()
        return chain_tracker
