"""Contains the LmdbStore class."""

# Standard Python Stuff
import sys
import os
import uuid
from typing import Tuple, Callable, Iterable, Optional, Set, Union
from struct import pack
from lmdb import open as ldmbopen, Transaction as Trxn, Cursor # type: ignore

# Gink Implementation
from .builders import (BundleBuilder, ChangeBuilder, EntryBuilder, MovementBuilder,
                       ContainerBuilder, ClearanceBuilder, Message, Behavior)
from .typedefs import MuTimestamp, UserKey, Medallion
from .tuples import Chain, FoundEntry, PositionedEntry, FoundContainer
from .muid import Muid
from .bundle_info import BundleInfo
from .abstract_store import AbstractStore
from .chain_tracker import ChainTracker
from .lmdb_utilities import to_last_with_prefix
from .coding import (encode_key, create_deleting_entry, EntryStoragePair, decode_muts, wrap_change,
                     PlacementKey, encode_muts, QueueMiddleKey, DIRECTORY, SEQUENCE, serialize,
                     ensure_entry_is_valid, deletion, Deletion, decode_entry_occupant, RemovalKey,
                     LocationKey, PROPERTY, BOX, decode_value)


class LmdbStore(AbstractStore):
    """
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
        self._properties = self._handle.open_db(b"properties")
        self._placements = self._handle.open_db(b"placements")
        self._by_describing = self._handle.open_db(b"by_describing")
        self._by_pointee = self._handle.open_db(b"by_pointee")
        self._by_name = self._handle.open_db(b"by_name")
        self._outbox = self._handle.open_db(b"outbox")
        if reset:
            with self._handle.begin(write=True) as txn:
                # Setting delete=False signals to lmdb to truncate the tables rather than drop them
                txn.drop(self._bundles, delete=False)
                txn.drop(self._chains, delete=False)
                txn.drop(self._claims, delete=False)
                txn.drop(self._entries, delete=False)
                txn.drop(self._removals, delete=False)
                txn.drop(self._containers, delete=False)
                txn.drop(self._locations, delete=False)
                txn.drop(self._retentions, delete=False)
                txn.drop(self._clearances, delete=False)
                txn.drop(self._properties, delete=False)
                txn.drop(self._outbox, delete=False)
        with self._handle.begin() as txn:
            # I'm checking to see if retentions are set in a read-only transaction, because if
            # they are and another process has this file open I don't want to wait to get a lock.
            # (lmdb only allows for one writing transaction)
            retentions_set = txn.get(b"bundles", db=self._retentions) is not None
        if not retentions_set:
            with self._handle.begin(write=True) as txn:
                # check again now that I have the write-lock to avoid a race condition
                retentions_set = txn.get(b"bundles", db=self._retentions) is not None
                if not retentions_set:
                    txn.put(b"bundles", encode_muts(int(retain_bundles)), db=self._retentions)
                    txn.put(b"entries", encode_muts(int(retain_entries)), db=self._retentions)
            # TODO: add methods to drop out-of-date entries and/or turn off retention
            # TODO: add purge method to remove particular data even when retention is on
            # TODO: add expiries table to keep track of when things need to be removed

    def get_all_containers(self) -> Iterable[Tuple[Muid, ContainerBuilder]]:
        yield Muid(-1, -1, 7), ContainerBuilder()
        yield Muid(-1, -1, 8), ContainerBuilder()
        with self._handle.begin() as trxn:
            container_cursor: Cursor = trxn.cursor(self._containers)
            positioned = container_cursor.first()
            while positioned:
                key, val = container_cursor.item()
                container_builder = ContainerBuilder()
                container_builder.ParseFromString(val)
                yield Muid.from_bytes(key), container_builder
                positioned = container_cursor.next()

    def get_comment(self, *, medallion: Medallion, timestamp: MuTimestamp) -> Optional[str]:
        with self._handle.begin() as trxn:
            bundles_cursor = trxn.cursor(self._bundles)
            found = to_last_with_prefix(bundles_cursor, prefix=pack(">QQ", timestamp, medallion))
            if not found:
                return None
            bundle_info = BundleInfo.from_bytes(found)
            return bundle_info.comment

    def get_container(self, container: Muid) -> ContainerBuilder:
        with self._handle.begin() as trxn:
            container_definition_bytes = trxn.get(bytes(container), db=self._containers)
            if not isinstance(container_definition_bytes, bytes):
                raise KeyError(f"container definition not found for: {container}")
            container_builder = ContainerBuilder()
            assert isinstance(container_builder, Message)
            container_builder.ParseFromString(container_definition_bytes)
            return container_builder

    def get_some(self, cls, last_index: Optional[int] = None):
        """ gets several instance of the given class """
        if last_index is None:
            last_index = 2 ** 52
        assert isinstance(last_index, int)
        # pylint: disable=invalid-unary-operand-type
        remaining = (last_index if last_index >= 0 else ~last_index) + 1
        with self._handle.begin() as trxn:
            table = {
                BundleBuilder: self._bundles,
                EntryBuilder: self._entries,
                MovementBuilder: self._removals,
                BundleInfo: self._bundles,
                PlacementKey: self._entries,
                RemovalKey: self._removals,
                LocationKey: self._locations,
            }[cls]
            cursor = trxn.cursor(table)
            placed = cursor.first() if last_index >= 0 else cursor.last()
            while placed:
                if remaining == 0:
                    break
                else:
                    remaining -= 1
                if issubclass(cls, Message):
                    yield cls.FromString(cursor.value())  # type: ignore
                else:
                    yield cls.from_bytes(cursor.key())  # type: ignore
                placed = cursor.next() if last_index >= 0 else cursor.prev()

    def _get_behavior(self, container: Muid, trxn: Trxn) -> int:
        if container.timestamp == -1:
            return container.offset
        container_definition_bytes = trxn.get(bytes(container), db=self._containers)
        assert isinstance(container_definition_bytes, bytes)
        container_builder = ContainerBuilder()
        container_builder.ParseFromString(container_definition_bytes)  # type: ignore
        return container_builder.behavior  # type: ignore # pylint: disable=maybe-no-member

    def _container_reset_changes(
            self,
            to_time: MuTimestamp,
            container: Muid,
            seen: Optional[Set],
            trxn: Trxn) -> Iterable[ChangeBuilder]:
        """ Figures out which specific reset method to call to reset a container. """
        behavior = self._get_behavior(container, trxn)
        if behavior == DIRECTORY:
            for change in self._get_directory_reset_changes(container, to_time, trxn, seen, None):
                yield change
            return
        if behavior == SEQUENCE:
            for change in self._get_sequence_reset_changes(container, to_time, trxn, seen):
                yield change
            return
        if behavior == BOX:
            for change in self._get_box_reset_changes(container, to_time, trxn, seen):
                yield change
        else:
            raise NotImplementedError(f"don't know how to reset container of type {behavior}")

    def get_reset_changes(self, to_time: MuTimestamp, container: Optional[Muid],
                          user_key: Optional[UserKey], recursive=True) -> Iterable[ChangeBuilder]:
        if container is None and user_key is not None:
            raise ValueError("can't specify key without specifying container")
        if container is None:
            recursive = False  # don't need to recuse if we're going to do everything anyway
        seen: Optional[Set] = set() if recursive else None
        with self._handle.begin() as txn:
            if container is None:
                # we're resetting everything, so loop over the container definitions
                containers_cursor = txn.cursor(self._containers)
                cursor_placed: bool = containers_cursor.first()
                while cursor_placed:
                    muid = Muid.from_bytes(containers_cursor.key())
                    for change in self._container_reset_changes(to_time, muid, seen, txn):
                        yield change
                    cursor_placed = containers_cursor.next()
                # then loop over the "magic" pre-defined
                for behavior in [DIRECTORY, SEQUENCE, BOX]:
                    muid = Muid(-1, -1, behavior)
                    for change in self._container_reset_changes(to_time, muid, seen, txn):
                        yield change
            else:
                if user_key is not None:
                    for change in self._get_directory_reset_changes(
                            container, to_time, txn, seen, user_key):
                        yield change
                else:
                    for change in self._container_reset_changes(to_time, container, seen, txn):
                        yield change

    def _parse_entry(self, entries_cursor, behavior: int, trxn: Trxn) -> EntryStoragePair:
        key_as_bytes, value_as_bytes = entries_cursor.item()
        parsed_key = PlacementKey.from_bytes(key_as_bytes, behavior)
        entry_builder = EntryBuilder()
        entry_builder.ParseFromString(trxn.get(value_as_bytes, db=self._entries))  # type: ignore
        return EntryStoragePair(parsed_key, entry_builder)

    def _get_box_reset_changes(
            self,
            container: Muid,
            to_time: MuTimestamp,
            trxn: Trxn,
            seen: Optional[Set[Muid]],
    ) -> Iterable[ChangeBuilder]:
        """ Gets all of the changes needed to reset a specific Gink box to a past time.

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
        cursor = trxn.cursor(db=self._placements)

        to_process = to_last_with_prefix(cursor, bytes(container))

        while to_process:
            current = self._parse_entry(cursor, BOX, trxn=trxn)
            if current.key.entry_muid.timestamp < to_time and last_clear_time < to_time:
                # no updates or clears have happened since to_time
                recurse_on = decode_entry_occupant(current)
            else:
                #only here if a clear or change has been made since to_time
                if last_clear_time <= current.key.entry_muid.timestamp:
                    contained_now = decode_entry_occupant(current)
                else:
                    contained_now = deletion

            # we know what's there now, next have to find out what was there at to_time
            last_clear_before_to_time = self._get_time_of_prior_clear(trxn, container, to_time)
            limit = PlacementKey(container, None, Muid(to_time, 0, 0), None)
            assert isinstance(to_process, bytes)
            through_middle = to_process[:-24]
            assert bytes(limit)[:-24] == through_middle
            found = to_last_with_prefix(cursor, through_middle, boundary=bytes(limit))
            data_then = self._parse_entry(cursor, BOX, trxn) if found else None
            if data_then and data_then.key.entry_muid.timestamp > last_clear_before_to_time:
                contained_then = decode_entry_occupant(data_then)
            else:
                contained_then = deletion

            # now we know what was contained then, we just have to decide what to do with it
            if contained_then != contained_now:
                if isinstance(contained_then, Deletion):
                    yield wrap_change(create_deleting_entry(container, None))
                else:
                    yield wrap_change(data_then.builder) # type: ignore
            recurse_on = contained_then

            if seen is not None and isinstance(recurse_on, Muid):
                for change in self._container_reset_changes(to_time, recurse_on, seen, trxn):
                    yield change
            limit = PlacementKey(container, None, Muid(0, 0, 0), None)
            to_process = to_last_with_prefix(cursor, container, boundary=limit)

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
        # pylint: disable=maybe-no-member
        if seen is not None:
            if container in seen:
                return
            seen.add(container)
        last_clear_time = self._get_time_of_prior_clear(trxn, container)
        clear_before_to = self._get_time_of_prior_clear(trxn, container, as_of=to_time)
        prefix = bytes(container)
        # Sequence entries can be repositioned, but they can't be re-added once removed or expired.
        placements_cursor = trxn.cursor(self._placements)
        positioned = placements_cursor.set_range(prefix)
        while positioned and placements_cursor.key().startswith(prefix):
            key_bytes = placements_cursor.key()
            parsed_key = PlacementKey.from_bytes(key_bytes, SEQUENCE)
            location = self._get_location(trxn, parsed_key.entry_muid)
            previous = self._get_location(trxn, parsed_key.entry_muid, as_of=to_time)
            placed_time = parsed_key.get_placed_time()
            if placed_time >= to_time and last_clear_time < placed_time and location == parsed_key:
                # this entry was put there recently and it's still there
                change_builder = ChangeBuilder()
                container.put_into(change_builder.movement.container)  # type: ignore
                parsed_key.entry_muid.put_into(change_builder.movement.entry)  # type: ignore
                if previous:
                    change_builder.movement.dest = previous.get_queue_position()  # type: ignore
                yield change_builder
            if previous == parsed_key and clear_before_to < placed_time:
                # this entry existed there at to_time
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(trxn.get(placements_cursor.value(), db=self._entries))
                occupant = decode_entry_occupant(EntryStoragePair(parsed_key, entry_builder))
                if isinstance(occupant, Muid) and seen is not None:
                    for change in self._container_reset_changes(to_time, occupant, seen, trxn):
                        yield change
                if location != previous or last_clear_time > placed_time:
                    # but isn't there any longer
                    entry_builder.effective = parsed_key.get_queue_position()  # type: ignore
                    yield wrap_change(entry_builder)
            positioned = placements_cursor.next()

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
        cursor = trxn.cursor(db=self._placements)
        maybe_user_key_bytes = bytes()
        if single_user_key is not None:
            maybe_user_key_bytes = serialize(encode_key(single_user_key))
        to_process = to_last_with_prefix(cursor, bytes(container) + maybe_user_key_bytes)
        while to_process:
            # does one pass through this loop for each distinct user key needed to process
            current = self._parse_entry(cursor, DIRECTORY, trxn)
            user_key = current.key.middle_key
            assert isinstance(user_key, (int, str, bytes))
            if current.key.entry_muid.timestamp < to_time and last_clear_time < to_time:
                # no updates to this key specifically or clears have happened since to_time
                recurse_on = decode_entry_occupant(current)
            else:
                # only here if a clear or change has been made to this key since to_time
                if last_clear_time <= current.key.entry_muid.timestamp:
                    contained_now = decode_entry_occupant(current)
                else:
                    contained_now = deletion

                # we know what's there now, next have to find out what was there at to_time
                last_clear_before_to_time = self._get_time_of_prior_clear(trxn, container, to_time)
                limit = PlacementKey(container, user_key, Muid(to_time, 0, 0), None)
                assert isinstance(to_process, bytes)
                through_middle = to_process[:-24]
                assert bytes(limit)[:-24] == through_middle
                found = to_last_with_prefix(cursor, through_middle, boundary=bytes(limit))
                data_then = self._parse_entry(cursor, DIRECTORY, trxn) if found else None
                if data_then and data_then.key.entry_muid.timestamp > last_clear_before_to_time:
                    contained_then = decode_entry_occupant(data_then)
                else:
                    contained_then = deletion

                # now we know what was contained then, we just have to decide what to do with it
                if contained_then != contained_now:
                    if isinstance(contained_then, Deletion):
                        yield wrap_change(create_deleting_entry(container, user_key))
                    else:
                        yield wrap_change(data_then.builder)  # type: ignore
                recurse_on = contained_then

            if seen is not None and isinstance(recurse_on, Muid):
                for change in self._container_reset_changes(to_time, recurse_on, seen, trxn):
                    yield change
            if single_user_key:
                break
            limit = PlacementKey(container, current.key.middle_key, Muid(0, 0, 0), None)
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

    def _get_location(self, txn, entry_muid: Muid, as_of: int = -1) -> Optional[PlacementKey]:
        """ Tells the location of a particular entry as of a given time. """
        loc_cursor = txn.cursor(self._locations)
        found = to_last_with_prefix(loc_cursor, entry_muid, Muid(as_of, 0, 0))
        if not found:
            return None
        entries_key_bytes = loc_cursor.value()
        if len(entries_key_bytes) == 0:
            return None
        return PlacementKey.from_bytes(entries_key_bytes, SEQUENCE)

    def get_positioned_entry(self, entry: Muid,
                             as_of: MuTimestamp = -1) -> Optional[PositionedEntry]:
        with self._handle.begin() as trxn:
            placement = self._get_location(trxn, entry, as_of=as_of)
            if not placement:
                return None
            middle_key = placement.middle_key
            assert isinstance(middle_key, QueueMiddleKey)
            entry_builder = EntryBuilder()
            entry_builder.ParseFromString(trxn.get(bytes(entry), db=self._entries))
            return PositionedEntry(
                middle_key.effective_time,
                placement.get_positioner(),
                entry,
                entry_builder)

    def _get_time_of_prior_clear(self, trxn: Trxn, container: Muid,
                                 as_of: MuTimestamp = -1) -> MuTimestamp:
        as_of_muid_bytes = bytes(Muid(as_of, 0, 0))
        cursor = trxn.cursor(self._clearances)
        most_recent_clear = to_last_with_prefix(cursor, bytes(container), as_of_muid_bytes)
        clearance_time = 0
        if most_recent_clear:
            clearance_time = Muid.from_bytes(most_recent_clear[16:32]).timestamp
        return clearance_time

    def get_entry_by_key(self, container: Muid, key: Union[None, UserKey, Muid],
                         as_of: MuTimestamp = -1) -> Optional[FoundEntry]:
        """ Gets a single entry (or none if nothing in the database matches).

        When "key" is None, assumes that the container is a box and returns the most
        recent entry for "container" written before the as_of time.

        When "key" is a UserKey (i.e. str or int) then assumes that "container" is a
        directory, so grabs the latest value written for that key by the given time.

        When "key" is a Muid, assumes that "container" is a queue and that the "key"
        is the muid for the desired entry.
        """

        entry_builder = EntryBuilder()
        with self._handle.begin() as txn:
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            placements_cursor = txn.cursor(self._placements)
            if isinstance(key, Muid):
                serialized_key = bytes(key)
                behavior = PROPERTY
            elif isinstance(key, (int, str, bytes)):
                serialized_key = serialize(encode_key(key))
                behavior = DIRECTORY
            elif key is None:
                serialized_key = b""
                behavior = BOX
            else:
                raise TypeError(f"don't know what to do with key of type {type(key)}")

            placement_key_bytes = to_last_with_prefix(placements_cursor,
                                                  prefix=bytes(container) + serialized_key,
                                                  suffix=bytes(Muid(as_of, 0, 0)))
            if not placement_key_bytes:
                return None
            assert isinstance(placement_key_bytes, bytes)
            placement_key = PlacementKey.from_bytes(placement_key_bytes, behavior)
            if placement_key.entry_muid.timestamp < clearance_time:
                return None
            entry_builder.ParseFromString(txn.get(placements_cursor.value(), db=self._entries))
            return FoundEntry(placement_key.entry_muid, builder=entry_builder)

    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int] = None,
                            offset: int = 0, desc: bool = False) -> Iterable[PositionedEntry]:
        prefix = bytes(container)
        with self._handle.begin() as txn:
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            placements_cursor = txn.cursor(self._placements)
            removal_cursor = txn.cursor(self._removals)
            if desc:
                placed = to_last_with_prefix(placements_cursor, prefix)
            else:
                placed = placements_cursor.set_range(prefix)
            while placed and (limit is None or limit > 0):
                encoded_placements_key = placements_cursor.key()
                if not encoded_placements_key.startswith(prefix):
                    break  # moved onto entries for another container
                placement_key = PlacementKey.from_bytes(encoded_placements_key, SEQUENCE)
                middle_key = placement_key.middle_key
                assert isinstance(middle_key, QueueMiddleKey)
                if middle_key.effective_time > as_of:
                    if desc:
                        placements_cursor.prev()
                        continue
                    else:
                        break  # times will only increase
                placed_time = placement_key.get_placed_time()
                if placed_time >= as_of or placed_time < clearance_time:
                    placed = placements_cursor.prev() if desc else placements_cursor.next()
                    continue  # this was put here after when I'm looking, or a clear happened
                if placement_key.expiry and (placement_key.expiry < as_of):
                    placed = placements_cursor.prev() if desc else placements_cursor.next()
                    continue  # this entry has expired by the as_of time
                found_removal = to_last_with_prefix(removal_cursor, prefix=prefix + bytes(placement_key.get_positioner()))
                if found_removal and Muid.from_bytes(found_removal[32:]).timestamp < as_of:
                    placed = placements_cursor.prev() if desc else placements_cursor.next()
                    continue  # this entry at this position was (re)moved by this time
                # If we got here, then we know the entry is active at the as_of time.
                if offset > 0:
                    offset -= 1
                    placed = placements_cursor.prev() if desc else placements_cursor.next()
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(txn.get(placements_cursor.value(), db=self._entries))  # type: ignore
                yield PositionedEntry(
                    position=middle_key.effective_time,
                    positioner=placement_key.get_positioner(),
                    entry_muid=placement_key.entry_muid,
                    builder=entry_builder)
                if limit is not None:
                    limit -= 1
                placed = placements_cursor.prev() if desc else placements_cursor.next()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        """ gets all the active entries in a direcotry as of a particular time """
        container_prefix = bytes(container)
        as_of_bytes = bytes(Muid(as_of, 0, 0))
        with self._handle.begin() as txn:
            clearance_time = self._get_time_of_prior_clear(txn, container, as_of)
            cursor = txn.cursor(self._placements)
            ckey = to_last_with_prefix(cursor, container_prefix)
            while ckey:
                placement_key = PlacementKey.from_bytes(ckey, DIRECTORY)
                if placement_key.entry_muid.timestamp >= as_of:
                    # we've found a key, but the entry is too new, so look for an older one
                    through_middle = ckey[:-24]
                    ckey_as_of = to_last_with_prefix(cursor, through_middle, as_of_bytes)
                    if ckey_as_of:
                        placement_key = PlacementKey.from_bytes(ckey, DIRECTORY)
                        ckey = ckey_as_of
                    else:
                        # no entries for this key before the as-of time, go to next key
                        ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                        continue
                if clearance_time and placement_key.entry_muid.timestamp < clearance_time:
                    ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                    continue
                if placement_key.expiry and placement_key.expiry < as_of:
                    ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])
                    continue
                entry_builder = EntryBuilder()
                entry_builder.ParseFromString(txn.get(cursor.value(), db=self._entries))  # type: ignore
                yield FoundEntry(address=placement_key.entry_muid, builder=entry_builder)
                ckey = to_last_with_prefix(cursor, container_prefix, ckey[16:-24])

    def apply_bundle(self, bundle_bytes: bytes, push_into_outbox: bool = False
                     ) -> Tuple[BundleInfo, bool]:
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
                if push_into_outbox:
                    trxn.put(bytes(new_info), bundle_bytes, db=self._outbox)
                trxn.put(chain_key, bytes(new_info), db=self._chains)
                change_items = list(builder.changes.items())  # type: ignore
                change_items.sort()  # sometimes the protobuf library doesn't maintain order of maps
                for offset, change in change_items:  # type: ignore
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
        return new_info, needed

    def read_through_outbox(self) -> Iterable[Tuple[BundleInfo, bytes]]:
        with self._handle.begin() as trxn:
            outbox_cursor = trxn.cursor(self._outbox)
            positioned = outbox_cursor.first()
            while positioned:
                key, val = outbox_cursor.item()
                yield BundleInfo.from_bytes(key), val
                positioned = outbox_cursor.next()

    def remove_from_outbox(self, bundle_infos: Iterable[BundleInfo]):
        with self._handle.begin(write=True) as trxn:
            assert isinstance(trxn, Trxn)
            for bundle_info in bundle_infos:
                trxn.delete(bytes(bundle_info), db=self._outbox)

    def _apply_clearance(self, new_info: BundleInfo, trxn: Trxn, offset: int,
                         builder: ClearanceBuilder):
        container_muid = Muid.create(builder=getattr(builder, "container"), context=new_info)
        clearance_muid = Muid.create(context=new_info, offset=offset)
        entry_retention = decode_muts(trxn.get(b"entries", db=self._retentions))  # type: ignore
        if not entry_retention:
            clearance_cursor = trxn.cursor(db=self._clearances)
            while to_last_with_prefix(clearance_cursor, prefix=bytes(container_muid)):
                clearance_cursor.delete()
            entries_cursor = trxn.cursor(db=self._entries)
            locations_cursor = trxn.cursor(db=self._locations)
            while to_last_with_prefix(entries_cursor, prefix=bytes(container_muid)):
                esk = PlacementKey.from_bytes(entries_cursor.key(), entries_cursor.value())
                while to_last_with_prefix(locations_cursor, prefix=bytes(esk.entry_muid)):
                    locations_cursor.delete()
                entries_cursor.delete()
            removals_cursor = trxn.cursor(db=self._removals)
            while to_last_with_prefix(removals_cursor, prefix=bytes(container_muid)):
                removals_cursor.delete()
        new_key = bytes(container_muid) + bytes(clearance_muid)
        trxn.put(new_key, serialize(builder), db=self._clearances)

    def _apply_movement(self, new_info: BundleInfo, txn: Trxn, offset: int,
                        builder: MovementBuilder):
        """ (Re)moves an entry from the store.

            Will be via a soft delete if retaining entry history or a hard delete if not.
        """
        retaining = bool(decode_muts(txn.get(b"entries", db=self._retentions)))  # type: ignore
        container = Muid.create(builder=getattr(builder, "container"), context=new_info)
        entry_muid = Muid.create(builder=getattr(builder, "entry"), context=new_info)
        movement_muid = Muid.create(context=new_info, offset=offset)
        dest = getattr(builder, "dest")
        locations_cursor = txn.cursor(self._locations)
        existing_location_key = to_last_with_prefix(locations_cursor, bytes(entry_muid))
        if not existing_location_key:
            print(f"WARNING: no existing_location_key for {entry_muid}", file=sys.stderr)
            return None  # can't move something I don't know about
        existing_location_time = LocationKey.from_bytes(existing_location_key).placement.timestamp
        if existing_location_time > movement_muid.timestamp:
            # I'm intentionally ignoring the case where a past (re)move shows up after a later one.
            # This means that while the present state will always converge, the history might not.
            print("WARNING: existing_location_time > movement_muid.timestamp", file=sys.stderr)
            return None
        existing_location_value = locations_cursor.value()
        if len(existing_location_value) == 0:
            print(f"WARNING: {entry_muid} has already been deleted", file=sys.stderr)
            return None  # already has been deleted
        existing_placement = PlacementKey.from_bytes(existing_location_value, SEQUENCE)
        entry_expiry = existing_placement.expiry
        if entry_expiry and movement_muid.timestamp > entry_expiry:
            print(f"WARNING: entry {entry_muid} has already expired", file=sys.stderr)
            return  # refuse to move a entry that's already expired
        if retaining:
            # only keep the removal info if doing a soft delete, otherwise just nuke the entry
            removal_key = RemovalKey(container, existing_placement.get_positioner(), movement_muid)
            removal_val = serialize(builder)
            txn.put(bytes(removal_key), removal_val, db=self._removals)
        new_location_key = bytes(LocationKey(entry_muid, movement_muid))
        if dest:
            middle_key = QueueMiddleKey(dest, movement_muid)
            placement_key = PlacementKey(container, middle_key, entry_muid, entry_expiry)
            serialized_placement = bytes(placement_key)
            txn.put(serialized_placement, serialize(entry_muid), db=self._placements)
            txn.put(new_location_key, serialized_placement, db=self._locations)
        elif retaining:
            txn.put(new_location_key, b"", db=self._locations)
        if not retaining:
            # remove the entry at the old location, and the old location entry
            txn.delete(existing_location_value, db=self._placements)
            txn.delete(existing_location_key, db=self._locations)
            if not dest:
                txn.delete(bytes(entry_muid), db=self._entries)

    def _add_entry(self, new_info: BundleInfo, txn: Trxn, offset: int, builder: EntryBuilder):
        retaining = bool(decode_muts(bytes(txn.get(b"entries", db=self._retentions))))
        ensure_entry_is_valid(builder=builder, context=new_info)
        placement_key = PlacementKey.from_builder(builder, new_info, offset)
        entry_muid = placement_key.entry_muid
        container_muid = placement_key.container
        serialized_placement_key = bytes(placement_key)
        if builder.behavior in (Behavior.DIRECTORY, Behavior.BOX, Behavior.PROPERTY, Behavior.LABEL):
            found_entry = self.get_entry_by_key(container_muid, placement_key.middle_key)
            if found_entry:
                if retaining:
                    removal_key = bytes(container_muid) + bytes(found_entry.address) + bytes(entry_muid)
                    txn.put(removal_key, b"", db=self._removals)
                else:
                    self._remove_entry(found_entry.address, txn)
        entry_key = bytes(entry_muid)
        txn.put(entry_key, serialize(builder), db=self._entries)
        txn.put(serialized_placement_key, entry_key, db=self._placements)
        entries_loc_key = bytes(LocationKey(entry_muid, entry_muid))
        txn.put(entries_loc_key, serialized_placement_key, db=self._locations)
        if builder.HasField("describing"):
            describing_muid = Muid.create(new_info, builder.describing)
            descriptor_key = bytes(describing_muid) + bytes(container_muid) + bytes(entry_muid)
            txn.put(descriptor_key, pack("b", builder.behavior), db=self._by_describing)
        if builder.HasField("pointee"):
            pointee_muid = Muid.create(new_info, builder.pointee)
            pointee_key = bytes(pointee_muid) + bytes(container_muid) + bytes(entry_muid)
            txn.put(pointee_key, pack("b", builder.behavior), db=self._by_pointee)
        if container_muid == Muid(-1, -1, Behavior.PROPERTY):
            if builder.HasField("value") and builder.HasField("describing"):
                describing_muid = Muid.create(new_info, builder.describing)
                name = decode_value(builder.value)
                if isinstance(name, str):
                    by_name_key = name.encode() + b"\x00" + bytes(entry_muid) + bytes(describing_muid)
                    txn.put(by_name_key, b"", db=self._by_name)

    def _remove_entry(self, entry_muid: Muid, trxn: Trxn):
        entry_muid_bytes = bytes(entry_muid)
        entry_payload = trxn.pop(entry_muid_bytes, db=self._entries)
        if entry_payload is None:
            print(f"entry already gone? {entry_muid}", file=sys.stderr)
            return
        loc_cursor = trxn.cursor(self._locations)
        placed = loc_cursor.set_range(entry_muid_bytes)
        while placed:
            location_key, placement_key = loc_cursor.item()
            if not location_key.startswith(entry_muid_bytes):
                break
            trxn.delete(placement_key, db=self._placements)
            loc_cursor.delete()
            placed = loc_cursor.next()
        entry_builder = EntryBuilder()
        entry_builder.ParseFromString(entry_payload)
        container_muid = Muid.create(entry_muid, entry_builder.container)
        if entry_builder.HasField("describing"):
            describing_muid = Muid.create(entry_muid, entry_builder.describing)
            descriptor_key = bytes(describing_muid) + bytes(container_muid) + bytes(entry_muid)
            trxn.delete(descriptor_key, db=self._by_describing)
        if entry_builder.HasField("pointee"):
            pointee_muid = Muid.create(entry_muid, entry_builder.pointee)
            pointee_key = bytes(pointee_muid) + bytes(container_muid) + bytes(entry_muid)
            trxn.delete(pointee_key, db=self._by_pointee)
        if container_muid == Muid(-1, -1, Behavior.PROPERTY):
            if entry_builder.HasField("value") and entry_builder.HasField("describing"):
                describing_muid = Muid.create(entry_muid, entry_builder.describing)
                name = decode_value(entry_builder.value)
                if isinstance(name, str):
                    by_name_key = name.encode() + b"\x00" + bytes(describing_muid) + bytes(entry_muid)
                    trxn.delete(by_name_key, db=self._by_name)

    def get_bundles(self, callback: Callable[[bytes, BundleInfo], None], since: MuTimestamp = 0):
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

    def get_by_name(self, name, as_of: MuTimestamp = -1) -> Iterable[FoundContainer]:
        prefix = name.encode() + b"\x00"
        name_property_bytes = bytes(Muid(-1, -1, Behavior.PROPERTY))
        with self._handle.begin() as trxn:
            retaining_entries = decode_muts(trxn.get(b"entries", db=self._retentions))  # type: ignore
            by_name_cursor = trxn.cursor(self._by_name)
            removals_cursor = trxn.cursor(self._removals)
            placed = by_name_cursor.set_range(prefix)
            while placed:
                key = by_name_cursor.key()
                if not key.startswith(prefix):
                    break
                entry_muid_bytes = key[-32:-16]
                named_muid_bytes = key[-16:]
                entry_muid = Muid.from_bytes(entry_muid_bytes)
                if retaining_entries:
                    removed = to_last_with_prefix(
                        removals_cursor,
                        prefix=name_property_bytes + entry_muid_bytes,
                        suffix=bytes(Muid(as_of, 0, 0)))
                else:
                    removed = None
                if (not removed) and (as_of == -1 or entry_muid.timestamp < as_of):
                    proto_bytes = trxn.get(named_muid_bytes, db=self._containers)
                    container_builder = ContainerBuilder()
                    container_builder.ParseFromString(proto_bytes)
                    yield FoundContainer(Muid.from_bytes(named_muid_bytes), container_builder)
                placed = by_name_cursor.next()
