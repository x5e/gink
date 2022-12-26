""" Contains the MemoryStore class, and implementation of the AbstractStore interface. """

# standard python stuff
from typing import Tuple, Callable, Optional, Iterable, Union
from sortedcontainers import SortedDict

# generated protobuf builder
from ..builders.bundle_pb2 import Bundle as BundleBuilder
from ..builders.entry_pb2 import Entry as EntryBuilder
from ..builders.movement_pb2 import Movement as MovementBuilder

# gink modules
from .typedefs import UserKey, MuTimestamp
from .tuples import Chain, FoundEntry, PositionedEntry
from .bundle_info import BundleInfo
from .abstract_store import AbstractStore
from .chain_tracker import ChainTracker
from .muid import Muid
from .coding import EntryStorageKey, SCHEMA, encode_muts, serialize, QueueMiddleKey


class MemoryStore(AbstractStore):
    """ Stores the data for a Gink database in memory.

        (Primarily for use in testing and to be used as a base clase.)
    """
    _bundles: SortedDict  # BundleInfo => bytes
    _chain_infos: SortedDict  # Chain => BundleInfo
    _claimed_chains: SortedDict  # Chain
    _entries: SortedDict  # bytes(EntryStorageKey) => EntryBuilder
    _entry_locations: SortedDict
    _containers: SortedDict  # muid => builder
    _removals: SortedDict 

    def __init__(self):
        self._bundles = SortedDict()
        self._chain_infos = SortedDict()
        self._claimed_chains = SortedDict()
        self._entries = SortedDict()
        self._containers = SortedDict()
        self._entry_locations = SortedDict()
        self._removals = SortedDict()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        cont_bytes = bytes(container)
        iterator = self._entries.irange(
            minimum=cont_bytes, maximum=cont_bytes + b"\xFF", reverse=True)
        last = None
        for entry_key in iterator:
            entry_storage_key = EntryStorageKey.from_bytes(entry_key, SCHEMA)
            if entry_storage_key.expiry and entry_storage_key.expiry < as_of:
                continue
            if entry_storage_key.middle_key == last:
                continue
            if entry_storage_key.entry_muid.timestamp > as_of:
                continue
            yield FoundEntry(builder=self._entries[entry_key],
                             address=entry_storage_key.entry_muid)
            last = entry_storage_key.middle_key

    def get_entry(self, container: Muid, key: Union[UserKey, Muid, None], 
            as_of: MuTimestamp) -> Optional[FoundEntry]:
        if isinstance(key, Muid):
            entry_location = self._get_entry_location(key, as_of=as_of)
            if not entry_location:
                return None
            entry_storage_key = EntryStorageKey.from_bytes(entry_location)
            return FoundEntry(entry_storage_key.entry_muid, self._entries[entry_location])
        as_of_muid = Muid(timestamp=as_of, medallion=0, offset=0)
        epoch_muid = Muid(0, 0, 0)
        minimum = bytes(EntryStorageKey(container, key, epoch_muid, None))
        maximum = bytes(EntryStorageKey(container, key, as_of_muid, None))
        iterator = self._entries.irange(
            minimum=minimum,
            maximum=maximum, reverse=True)
        for encoded_entry_storage_key in iterator:
            entry_storage_key = EntryStorageKey.from_bytes(
                encoded_entry_storage_key)
            builder = self._entries[encoded_entry_storage_key]
            return FoundEntry(address=entry_storage_key.entry_muid, builder=builder)
        return None

    def get_claimed_chains(self) -> Iterable[Chain]:
        for key, val in self._claimed_chains.items():
            yield Chain(key, val)

    def claim_chain(self, chain: Chain):
        self._claimed_chains[chain.medallion] = chain.chain_start

    def get_ordered_entries(
        self, 
        container: Muid, 
        as_of: MuTimestamp, 
        limit: Optional[int] = None,
        offset: int = 0, 
        desc: bool = False,
        ) -> Iterable[PositionedEntry]:

        prefix = bytes(container)
        removals_suffix = b"\xFF" * 16
        for esk_bytes in self._entries.irange(prefix, prefix + encode_muts(as_of), reverse=desc):
            if limit is not None and limit <= 0:
                break
            parsed_esk = EntryStorageKey.from_bytes(esk_bytes)
            if parsed_esk.get_placed_time() > as_of:
                continue
            if parsed_esk.expiry and parsed_esk.expiry < as_of:
                continue
            removals_prefix = esk_bytes[0:40]
            found_removal = False
            for rkey in self._removals.irange(removals_prefix, removals_prefix + removals_suffix):
                found_removal = Muid.from_bytes(rkey[40:]).timestamp < as_of
                break
            if found_removal:
                continue
            # If we got here, then we know the entry is active at the as_of time.
            if offset > 0:
                offset -= 1
                continue
            middle_key = parsed_esk.middle_key
            assert isinstance(middle_key, QueueMiddleKey)
            entry_builder = self._entries[esk_bytes]
            yield PositionedEntry(
                    position=middle_key.effective_time, 
                    positioner=middle_key.movement_muid or parsed_esk.entry_muid,
                    entry_muid=parsed_esk.entry_muid,
                    entry_data=entry_builder)
            if limit is not None:
                limit -= 1

    def apply_bundle(self, bundle_bytes: bytes) -> Tuple[BundleInfo, bool]:
        bundle_builder = BundleBuilder()
        bundle_builder.ParseFromString(bundle_bytes)  # type: ignore
        new_info = BundleInfo(builder=bundle_builder)
        chain_key = new_info.get_chain()
        old_info = self._chain_infos.get(new_info.get_chain())
        needed = AbstractStore._is_needed(new_info, old_info)
        if needed:
            self._bundles[new_info] = bundle_bytes
            self._chain_infos[chain_key] = new_info
            for offset, change in bundle_builder.changes.items():   # type: ignore
                if change.HasField("container"):
                    container_muid = Muid.create(
                        context=new_info, offset=offset)
                    self._containers[container_muid] = change.container
                    continue
                if change.HasField("entry"):
                    self._add_entry(new_info=new_info,offset=offset, entry_builder=change.entry)
                    continue
                if change.HasField("movement"):
                    self._add_movement(new_info=new_info, offset=offset, builder=change.movement)
                    continue
                raise AssertionError(
                    f"{repr(change.ListFields())} {offset} {new_info}")
        return (new_info, needed)
    
    def _add_movement(self, new_info: BundleInfo, offset: int, builder: MovementBuilder):
        container = Muid.create(getattr(builder, "container"), context=new_info)
        entry_muid = Muid.create(getattr(builder, "entry"), context=new_info)
        movement_muid = Muid.create(context=new_info, offset=offset)
        dest = getattr(builder, "dest")
        old_serialized_esk = self._get_entry_location(entry_muid)
        if not old_serialized_esk:
            return
        entry_storage_key = EntryStorageKey.from_bytes(old_serialized_esk)
        entry_expiry = entry_storage_key.expiry
        if entry_expiry and entry_expiry < movement_muid.timestamp:
            return # refuse to move an entry that's expired
        if movement_muid.timestamp < entry_storage_key.get_placed_time():
            # I'm intentionally ignoring the case where a past (re)move shows up after a later one.
            # This means that while the present state will always converge, the history might not.
            return
        removal_key = old_serialized_esk[0:40] + bytes(movement_muid)
        self._removals[removal_key] = builder
        new_location_key = bytes(entry_muid) + serialize(~movement_muid.timestamp)
        if dest:
            middle_key = QueueMiddleKey(dest, movement_muid)
            entry_storage_key = EntryStorageKey(container, middle_key, entry_muid, entry_expiry)
            new_serialized_esk = bytes(entry_storage_key)
            self._entries[new_serialized_esk] = self._entries[old_serialized_esk]
            self._entry_locations[new_location_key] = new_serialized_esk
        else:
            self._entry_locations[new_location_key] = None


    def _add_entry(self, new_info: BundleInfo, offset: int, entry_builder: EntryBuilder):
        esk = EntryStorageKey.from_builder(entry_builder, new_info, offset)
        encoded_entry_storage_key = bytes(esk)
        self._entries[encoded_entry_storage_key] = entry_builder
        entries_location_key = bytes(
            esk.entry_muid) + encode_muts(~esk.entry_muid.timestamp)
        self._entry_locations[entries_location_key] = encoded_entry_storage_key

    def get_bundles(self, callback: Callable[[bytes, BundleInfo], None], since: MuTimestamp=0):
        for bundle_info in self._bundles.irange(minimum=BundleInfo(timestamp=since)):
            assert isinstance(bundle_info, BundleInfo)
            data = self._bundles[bundle_info]
            assert isinstance(data, bytes)
            callback(data, bundle_info)

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        for bundle_info in self._chain_infos.values():
            assert isinstance(bundle_info, BundleInfo)
            chain_tracker.mark_as_having(bundle_info)
        return chain_tracker

    def _get_entry_location(self, entry_muid: Muid, as_of: MuTimestamp = -1) -> Optional[bytes]:
        bkey = bytes(entry_muid)
        for location_key in self._entry_locations.irange(
                bkey+encode_muts(~as_of), bkey+encode_muts(~0)):
            return self._entry_locations[location_key]
        return None
