"""Contains the LmdbStore class."""

# Standard Python Stuff
import sys
import os
import uuid
from typing import Tuple, Callable, Iterable, Optional, Set, Union
from struct import pack
from lmdb import open as ldmbopen, Transaction as Trxn
from google.protobuf.message import Message

# Generated Protobuf Modules
from ..builders.bundle_pb2 import Bundle as BundleBuilder
from ..builders.change_pb2 import Change as ChangeBuilder
from ..builders.entry_pb2 import Entry as EntryBuilder
from ..builders.movement_pb2 import Movement
from ..builders.container_pb2 import Container as ContainerBuilder
from ..builders.behavior_pb2 import Behavior
from ..builders.clearance_pb2 import Clearance

# Gink Implementation
from .typedefs import MuTimestamp, UserKey
from .tuples import Chain, FoundEntry, PositionedEntry
from .muid import Muid
from .bundle_info import BundleInfo
from .abstract_store import AbstractStore
from .chain_tracker import ChainTracker
from .lmdb_utilities import to_last_with_prefix
from .coding import (encode_key, create_deleting_entry, EntryStoragePair, decode_muts, wrap_change,
    EntryStorageKey, encode_muts, QueueMiddleKey, SCHEMA, QUEUE, serialize, 
    deletion, Deletion, decode_entry_occupant, MovementKey, LocationKey)

class LmdbStore(AbstractStore):
    """
    Uses the Lightning Memory Mapped Database (lmdb) to implement the Store interface.

    Under the hood, each gink.mdb file stores several "databases" (tables/b-trees):

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
            Designed so that the first 40 key bytes matches the first 40 bytes of the entries key.
            When removed to a different position and retaining history, the old entry stays,
            with the removal signaling a soft delete, and a new entry is added to the entries table.

            key: (container-muid, eff-ts, move/entry-muid, removal-muid)
            val: binaryproto of the movement
        
        locations - table used as an index to look-up entries by entry-muid for (re)-moving
            key: (entry-muid, placement-muid)
            val: key from the entries table

        containers - Map from muid to serialized containers definitions.

        retentions - Keeps track of what history is being stored.
            key: one of b"bundles", b"entries"
            val: Big endian encoded int64.
                0 - No history stored.
                1 - All history stored.
                <other microsecond timestamp> - time since when history has been retained
        
        clearances - tracks clearance changes (most recent per container if not retaining entries)
            key: (container-muid, clearance-muid)
            val: binaryproto of the clearance
    """

    def __init__(self, file_path=None, reset=False, retain_bundles=True, retain_entries=True):
        """ Opens a gink.mdb file for use as a Store.

            file_path: where find or place the data file
            reset: if True and file exists, will wipe it after opening
            retain_bundles: if not already set in this file, will specify bundle retention
            retain_entries: if not already set in this file, will specify entry retention
        """
        self._temporary = False
        if file_path is None:
            prefix = "/tmp/temp."
            if os.path.exists("/dev/shm"):
                prefix = "/dev/shm/temp."
            file_path = prefix + str(uuid.uuid4()) + ".gink.mdb"
            self._temporary = True
        self._file_path = file_path
        self._handle = ldmbopen(file_path, max_dbs=100, subdir=False)
        self._bundles = self._handle.open_db(b"bundles")
        self._chains = self._handle.open_db(b"chains")
        self._claims = self._handle.open_db(b"claims")
        self._entries = self._handle.open_db(b"entries")
        self._removals = self._handle.open_db(b"removals")
        self._containers = self._handle.open_db(b"containers")
        self._locations = self._handle.open_db(b"locations")
        self._retentions = self._handle.open_db(b"retentions")
        self._clearances = self._handle.open_db(b"clearances")
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
                txn.drop(self._clearances, delete=False)
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
            #TODO: add methods to drop out-of-date entries and/or turn off retention
            #TODO: add purge method to remove particular data even when retention is on
            #TODO: add expiries table to keep track of when things need to be removed

    def locate(self, what: Union[Muid, LocationKey], as_of: MuTimestamp=-1) -> EntryStorageKey:
        with self._handle.begin() as trxn:
            cursor = trxn.cursor(self._locations)
            hit = to_last_with_prefix(cursor, what, suffix=Muid(as_of, 0, 0))
            if not hit:
                raise ValueError(f"could not locate: {what} as of {as_of}")
            return EntryStorageKey.from_bytes(cursor.value())
            
    def get_one(self, Class, index: int = -1):
        skip = index if index >= 0 else ~index
        with self._handle.begin() as trxn:
            table = {
                BundleBuilder: self._bundles,
                EntryBuilder: self._entries,
                Movement: self._removals,
                BundleInfo: self._bundles,
                EntryStorageKey: self._entries,
                MovementKey: self._removals,
                LocationKey: self._locations,
            }[Class]
            cursor = trxn.cursor(table)
            placed = cursor.first() if index >= 0 else cursor.last()
            while placed:
                if skip == 0:
                    if issubclass(Class, Message):
                        builder = Class()
                        builder.ParseFromString(cursor.value()) # type: ignore
                        return builder
                    else:
                        return Class.from_bytes(cursor.key()) # type: ignore
                else:
                    skip -= 1
                    placed = cursor.next() if index >= 0 else cursor.prev()


    def _get_behavior(self, container: Muid, trxn: Trxn) -> int:
        if container.timestamp == -1:
            return container.offset
        else:
            container_definition_bytes = trxn.get(bytes(container), db=self._containers)
            assert isinstance(container_definition_bytes, bytes)
            container_builder = ContainerBuilder()
            container_builder.ParseFromString(container_definition_bytes) # type: ignore
            return container_builder.behavior # type: ignore

    def _container_reset_changes(
            self, 
            to_time: MuTimestamp, 
            container: Muid, 
            seen: Optional[Set],
            trxn: Trxn) -> Iterable[ChangeBuilder]:
        """ Figures out which specific reset method to call to reset a container. """
        behavior = self._get_behavior(container, trxn)
        if behavior == SCHEMA:
            for change in self._get_directory_reset_changes(container, to_time, trxn, seen, None):
                yield change
            return
        if behavior == QUEUE:
            for change in self._get_sequence_reset_changes(container, to_time, trxn, seen):
                yield change
            return
        else:
            raise NotImplementedError(f"don't know how to reset container of type {behavior}")

    def get_reset_changes(self, to_time: MuTimestamp, container: Optional[Muid], 
            user_key: Optional[UserKey], recursive=True) -> Iterable[ChangeBuilder]:
        if container is None and user_key is not None:
            raise ValueError("can't specify key without specifying container")
        if container is None:
            recursive = False # don't need to recuse if we're going to do everything anyway
        seen = set() if recursive else None
        with self._handle.begin() as txn:
            if container is None:
                # we're resetting everything, so loop over the container definitions
                containers_cursor = txn.cursor(self._containers)
                cursor_placed = containers_cursor.first()
                while cursor_placed:
                    muid = Muid.from_bytes(containers_cursor.key())
                    for change in self._container_reset_changes(to_time, muid, seen, txn):
                        yield change
                    cursor_placed = containers_cursor.next()
                # then loop over the "magic" pre-defined 
                for behavior in [SCHEMA, QUEUE]:
                    muid = Muid(-1, -1, behavior)
                    for change in self._container_reset_changes(to_time, muid, seen, txn):
                        yield change
            else:
                if user_key is not None:
                    it = self._get_directory_reset_changes(container, to_time, txn, seen, user_key)
                    for change in it:
                        yield change
                else:
                    for change in self._container_reset_changes(to_time, container, seen, txn):
                        yield change

    @staticmethod
    def _parse_entry(entries_cursor, behavior: int) -> EntryStoragePair:
        key_as_bytes, value_as_bytes = entries_cursor.item()
        parsed_key = EntryStorageKey.from_bytes(key_as_bytes, behavior)
        entry_builder = EntryBuilder()
        entry_builder.ParseFromString(value_as_bytes) # type: ignore
        return EntryStoragePair(parsed_key, entry_builder)

    def _get_sequence_reset_changes(
        self,
        container: Muid,
        to_time: MuTimestamp,
        trxn: Trxn,
        seen: Optional[Set[Muid]],
    ) -> Iterable[ChangeBuilder]:
        """ Gets all of the changes needed to reset a specific Gink sequence to a past time.
        
            If the `seen` argument is not None, then we're making the changes recursively.
            The `trxn` argument should be a lmdb read transaction.

            Note that this only makes changes to undo anything that actively happened since
            the specified time.  If the entry expired on its own since to_time then this won't
            resurrect it.

            Assumes that you're retaining entry history.
        """
        if seen is not None:
            if container in seen:
                return
            seen.add(container)
        last_clear_time = self._get_time_of_prior_clear(trxn, container)
        clear_before_to = self._get_time_of_prior_clear(trxn, container, as_of=to_time)
        prefix = bytes(container)
        # Sequence entries can be repositioned, but they can't be re-added once removed or expired.
        entries_cursor = trxn.cursor(self._entries)
        positioned = entries_cursor.set_range(prefix)
        while positioned and entries_cursor.key().startswith(prefix):
            key_bytes = entries_cursor.key()
            parsed_key = EntryStorageKey.from_bytes(key_bytes)
            location = self._get_location(trxn, parsed_key.entry_muid)
            previous = self._get_location(trxn, parsed_key.entry_muid, as_of=to_time)
            placed_time = parsed_key.get_placed_time()
            if placed_time > to_time and last_clear_time < placed_time and location == parsed_key:
                # this entry was put there recently and it's still there
                change_builder = ChangeBuilder()
                container.put_into(change_builder.movement.container) # type: ignore
                parsed_key.entry_muid.put_into(change_builder.movement.entry) # type: ignore
                if previous:
                    change_builder.movement.dest = previous.get_queue_position() # type: ignore
                yield change_builder
            if previous == parsed_key and clear_before_to < placed_time:
                # this entry existed there at to_time
                entry_builder = EntryBuilder()
                assert isinstance(entry_builder, Message)
                entry_builder.ParseFromString(entries_cursor.value())
                occupant = decode_entry_occupant(EntryStoragePair(parsed_key, entry_builder))
                if isinstance(occupant, Muid) and seen is not None:
                    for change in self._container_reset_changes(to_time, occupant, seen, trxn):
                        yield change
                if location != previous or last_clear_time > placed_time:
                    # but isn't there any longer
                    entry_builder.position = parsed_key.get_queue_position() # type: ignore
                    yield wrap_change(entry_builder)
            positioned = entries_cursor.next()

    def _get_directory_reset_changes(
        self,
        container: Muid,
        to_time: MuTimestamp,
        trxn: Trxn,
        seen: Optional[Set],
        single_user_key: Optional[UserKey],
        ) -> Iterable[ChangeBuilder]:
        """ Gets all of the entries necessary to reset a specific directory to what it looked
            like at some previous point in time (or only for a specific key if specified).
            If "seen" is passed, then recursively update sub-containers.
        """
        if seen is not None:
            if container in seen:
                return
            seen.add(container)
        last_clear_time = self._get_time_of_prior_clear(trxn, container)
        cursor = trxn.cursor(db=self._entries)
        maybe_user_key_bytes = bytes()
        if single_user_key is not None:
            maybe_user_key_bytes = serialize(encode_key(single_user_key))
        to_process = to_last_with_prefix(cursor, bytes(container) + maybe_user_key_bytes)
        while to_process:
            # does one pass through this loop for each distinct user key needed to process
            current = LmdbStore._parse_entry(cursor, SCHEMA)
            user_key = current.key.middle_key
            assert isinstance(user_key, (int, str))
            if current.key.entry_muid.timestamp < to_time and last_clear_time < to_time:
                # no updates to this key specifically or clears have happened since to_time
                recurse_on = decode_entry_occupant(current)
            else:
                # only here if a clear or change has been made to this key since to_time
                if last_clear_time > current.key.entry_muid.timestamp:
                    contained_now = deletion
                else:
                    contained_now = decode_entry_occupant(current)

                # we know what's there now, next have to find out what was there at to_time
                last_clear_before_to_time = self._get_time_of_prior_clear(trxn, container, to_time)
                limit = EntryStorageKey(container, user_key, Muid(to_time, 0, 0), None)
                assert isinstance(to_process, bytes)
                through_middle = to_process[:-24]
                assert bytes(limit)[:-24] == through_middle
                found = to_last_with_prefix(cursor, through_middle, boundary=bytes(limit))
                data_then = LmdbStore._parse_entry(cursor, SCHEMA) if found else None
                if data_then and data_then.key.entry_muid.timestamp > last_clear_before_to_time:
                    contained_then = decode_entry_occupant(data_then)
                else:
                    contained_then = deletion
            
                # now we know what was contained then, we just have to decide what to do with it
                if contained_then != contained_now:
                    if isinstance(contained_then, Deletion):
                        yield wrap_change(create_deleting_entry(container, user_key))
                    else:
                        yield wrap_change(data_then.builder) # type: ignore
                recurse_on = contained_then
            
            if seen is not None and isinstance(recurse_on, Muid):
                for change in self._container_reset_changes(to_time, recurse_on, seen, trxn):
                    yield change
            if single_user_key:
                break
            limit = EntryStorageKey(container, current.key.middle_key, Muid(0, 0, 0), None)
            to_process = to_last_with_prefix(cursor, container, boundary=limit)

    def close(self):
        self._handle.close()
        if self._temporary:
            os.unlink(self._file_path)

    def claim_chain(self, chain: Chain):
        with self._handle.begin(write=True) as txn:
            key = encode_muts(chain.medallion)
            val = encode_muts(chain.chain_start)
            txn.put(key, val, db=self._claims)

    def get_claimed_chains(self) -> Iterable[Chain]:
        assert self
        raise NotImplementedError()

    def _get_location(self, txn, entry_muid: Muid, as_of: int=-1) -> Optional[EntryStorageKey]:
        """ Tells the location of a particular entry as of a given time. """
        loc_cursor = txn.cursor(self._locations)
        found = to_last_with_prefix(loc_cursor, entry_muid, Muid(as_of, 0, 0))
        if not found:
            return None
        entries_key_bytes = loc_cursor.value()
        if len(entries_key_bytes) == 0:
            return None
        return EntryStorageKey.from_bytes(entries_key_bytes, QUEUE)
    
    def _get_time_of_prior_clear(self, trxn: Trxn, container: Muid, 
            as_of: MuTimestamp=-1)->MuTimestamp:
        as_of_muid_bytes = bytes(Muid(as_of, 0, 0))
        cursor = trxn.cursor(self._clearances)
        most_recent_clear = to_last_with_prefix(cursor, bytes(container), as_of_muid_bytes)
        clearance_time = 0
        if most_recent_clear:
            clearance_time = Muid.from_bytes(most_recent_clear[16:32]).timestamp
        return clearance_time

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
        as_of_muid = bytes(Muid(as_of, 0, 0))
        entry_builder = EntryBuilder()
        assert isinstance(entry_builder, Message)
        with self._handle.begin() as txn:
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            entries_cursor = txn.cursor(self._entries)
            if isinstance(key, Muid):
                if key.timestamp < clearance_time:
                    return None # no way to survive a clearance
                location = self._get_location(txn, key, as_of=as_of)
                if not location:
                    return None
                entry_builder.ParseFromString(txn.get(bytes(location), db=self._entries))
                return FoundEntry(location.entry_muid, entry_builder)
            built = serialize(encode_key(key)) if isinstance(key, (int, str)) else b""
            assert isinstance(key, (int, str)) or built == b""
            prefix = bytes(container) + built
            entry_key_bytes = to_last_with_prefix(entries_cursor, prefix, as_of_muid)
            if not entry_key_bytes:
                return None
            assert isinstance(entry_key_bytes, bytes)
            entry_storage_key = EntryStorageKey.from_bytes(entry_key_bytes, SCHEMA)
            if entry_storage_key.entry_muid.timestamp < clearance_time:
                return None
            entry_builder.ParseFromString(entries_cursor.value())
            return FoundEntry(entry_storage_key.entry_muid, builder=entry_builder)
    
    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int]=None, 
            offset: int=0, desc: bool=False) -> Iterable[PositionedEntry]:
        prefix = bytes(container)
        with self._handle.begin() as txn:
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            entries_cursor = txn.cursor(self._entries)
            removal_cursor = txn.cursor(self._removals)
            if desc:
                placed = to_last_with_prefix(entries_cursor, prefix)
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
                placed_time = parsed_key.get_placed_time()
                if placed_time >= as_of or placed_time < clearance_time:
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue # this was put here after when I'm looking, or a clear happened
                if parsed_key.expiry and (parsed_key.expiry < as_of):
                    placed = entries_cursor.prev() if desc else entries_cursor.next()
                    continue # this entry has expired by the as_of time
                found_removal = to_last_with_prefix(removal_cursor, prefix=entries_key[0:40])
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
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            cursor = txn.cursor(self._entries)
            ckey = to_last_with_prefix(cursor, container_prefix)
            while ckey:
                entry_storage_key = EntryStorageKey.from_bytes(ckey)
                if entry_storage_key.entry_muid.timestamp > as_of:
                    # we've found a key, but the entry is too new, so look for an older one
                    through_middle = ckey[:-24]
                    ckey = to_last_with_prefix(cursor, through_middle, as_of_bytes)
                    if ckey:
                        entry_storage_key = EntryStorageKey.from_bytes(ckey)
                    else:
                        # no entries for this key before the as-of time, go to next key
                        ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                        continue
                if clearance_time and entry_storage_key.entry_muid.timestamp < clearance_time:
                    ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                    continue
                if entry_storage_key.expiry and entry_storage_key.expiry < as_of:
                    ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(cursor.value())  # type: ignore
                yield FoundEntry(address=entry_storage_key.entry_muid, builder=entry_builder)
                ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])

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
                change_items = list(builder.changes.items()) # type: ignore
                change_items.sort() # sometimes the protobuf library doesn't maintain order of maps
                for offset, change in change_items:   # type: ignore
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
                    if change.HasField("clearance"):
                        self._apply_clearance(new_info, trxn, offset, change.clearance)
                        continue
                    raise AssertionError(f"Can't process change: {new_info} {offset} {change}")
        return (new_info, needed)
    
    def _apply_clearance(self, new_info: BundleInfo, trxn: Trxn, offset: int, builder: Clearance):
        container_muid = Muid.create(builder=getattr(builder, "container"), context=new_info)
        clearance_muid = Muid.create(context=new_info, offset=offset)
        entry_retention = decode_muts(trxn.get(b"entries", db=self._retentions)) # type: ignore
        if not entry_retention:
            clearance_cursor = trxn.cursor(db=self._clearances)
            while to_last_with_prefix(clearance_cursor, prefix=bytes(container_muid)):
                clearance_cursor.delete()
            entries_cursor = trxn.cursor(db=self._entries)
            locations_cursor = trxn.cursor(db=self._locations)
            while to_last_with_prefix(entries_cursor, prefix=bytes(container_muid)):
                esk = EntryStorageKey.from_bytes(entries_cursor.key())
                while to_last_with_prefix(locations_cursor, prefix=bytes(esk.entry_muid)):
                    locations_cursor.delete()
                entries_cursor.delete()
            removals_cursor = trxn.cursor(db=self._removals)
            while to_last_with_prefix(removals_cursor, prefix=bytes(container_muid)):
                removals_cursor.delete()
        new_key = bytes(container_muid) + bytes(clearance_muid)
        trxn.put(new_key, serialize(builder), db=self._clearances)
    
    def _apply_movement(self, new_info: BundleInfo, txn: Trxn, offset: int, builder: Movement):
        """ (Re)moves an entry from the store.

            Will be via a soft delete if retaining entry history or a hard delete if not.
        """
        retaining = bool(decode_muts(txn.get(b"entries", db=self._retentions))) # type: ignore
        container = Muid.create(builder=getattr(builder, "container"), context=new_info)
        entry_muid = Muid.create(builder=getattr(builder, "entry"), context=new_info)
        movement_muid = Muid.create(context=new_info, offset=offset)
        dest = getattr(builder, "dest")
        locations_cursor = txn.cursor(self._locations)
        existing_location_key = to_last_with_prefix(locations_cursor, bytes(entry_muid))
        if not existing_location_key:
            print(f"WARNING: no existing_location_key for {entry_muid}", file=sys.stderr)
            return None # can't move something I don't know about
        existing_location_time = LocationKey.from_bytes(existing_location_key).placement.timestamp
        if existing_location_time > movement_muid.timestamp:
            # I'm intentionally ignoring the case where a past (re)move shows up after a later one.
            # This means that while the present state will always converge, the history might not.
            print(f"WARNING: existing_location_time > movement_muid.timestamp", file=sys.stderr)
            return None
        existing_location_value = locations_cursor.value()
        if len(existing_location_value) == 0:
            print(f"WARNING: {entry_muid} has already been deleted", file=sys.stderr)
            return None # already has been deleted
        entries_cursor = txn.cursor(self._entries)
        existing_entry_found = entries_cursor.set_key(existing_location_value)
        assert existing_entry_found, "the locations table lied to me"
        storage_pair = LmdbStore._parse_entry(entries_cursor, QUEUE)
        entry_expiry = storage_pair.key.expiry
        if entry_expiry and movement_muid.timestamp > entry_expiry:
            print(f"WARNING: entry {entry_muid} has already expired", file=sys.stderr)
            return # refuse to move a entry that's already expired
        if retaining:
            # only keep the removal info if doing a soft delete, otherwise just nuke the entry
            removal_key = bytes(storage_pair.key)[0:40] + bytes(movement_muid)
            removal_val = serialize(builder)
            txn.put(removal_key, removal_val, db=self._removals)
        new_location_key = bytes(LocationKey(entry_muid, movement_muid))
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
        entries_loc_key = bytes(LocationKey(entry_muid, entry_muid))
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
