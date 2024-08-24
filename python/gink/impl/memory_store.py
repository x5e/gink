""" Contains the MemoryStore class, and implementation of the AbstractStore interface. """

# standard python stuff
from logging import getLogger
from typing import Tuple, Callable, Optional, Iterable, Union, Dict, Mapping, Set
from sortedcontainers import SortedDict  # type: ignore
from pathlib import Path
from nacl.signing import SigningKey, VerifyKey

# gink modules
from .builders import (BundleBuilder, EntryBuilder, MovementBuilder, ClearanceBuilder,
                       ContainerBuilder, Message, ChangeBuilder, ClaimBuilder)
from .typedefs import UserKey, MuTimestamp, Medallion, Deletion, Limit
from .tuples import Chain, FoundEntry, PositionedEntry, FoundContainer
from .bundle_info import BundleInfo
from .abstract_store import AbstractStore, BundleWrapper, Lock
from .chain_tracker import ChainTracker
from .muid import Muid
from .coding import (DIRECTORY, encode_muts, QueueMiddleKey, RemovalKey,
                     SEQUENCE, LocationKey, create_deleting_entry, wrap_change,
                     Placement, decode_key, decode_entry_occupant, EDGE_TYPE,
                     PROPERTY, decode_value, new_entries_replace)
from .utilities import create_claim, is_needed, generate_timestamp, resolve_timestamp


class MemoryStore(AbstractStore):
    """ Stores the data for a Gink database in memory.

        (Primarily for use in testing and to be used as a base clase for log-backed store.)
    """
    _bundles: SortedDict  # BundleInfo => BundleWrapper
    _entries: Dict[Muid, EntryBuilder]
    _chain_infos: SortedDict  # Chain => BundleInfo
    _claims: Dict[Medallion, ClaimBuilder]
    _placements: SortedDict  # bytes(PlacementKey) => EntryMuid
    _locations: SortedDict  # LocationKey => bytes(PlacementKey)
    _containers: SortedDict  # muid => builder
    _removals: SortedDict  # bytes(removal_key) => MovementBuilder
    _clearances: SortedDict
    _identities: SortedDict # Chain => str
    _by_name: SortedDict  # bytes(name) + b'x00' + bytes(entry_muid) => bytes(describing_muid)
    _by_describing: SortedDict # bytes(describing_muid) + bytes(entry_muid)] => bytes(container_muid)
    _verify_keys: Dict[Chain, VerifyKey]
    _signing_keys: Dict[VerifyKey, SigningKey]

    def __init__(self, retain_entries = True) -> None:
        # TODO: add a "no retention" capability for bundles?
        self._seen_containers: Set[Muid] = set()
        self._bundles = SortedDict()
        self._chain_infos = SortedDict()
        self._claims = SortedDict()
        self._entries = {}
        self._identities = SortedDict()
        self._placements = SortedDict()
        self._containers = SortedDict()
        self._locations = SortedDict()
        self._removals = SortedDict()
        self._clearances = SortedDict()
        self._by_name = SortedDict()
        self._by_describing = SortedDict()
        self._signing_keys = dict()
        self._verify_keys = dict()
        self._logger = getLogger(self.__class__.__name__)
        self._retaining_entries = retain_entries

    def drop_history(self, as_of: Optional[MuTimestamp] = None):
        if as_of is None:
            as_of = generate_timestamp()
        else:
            as_of = resolve_timestamp(as_of)
        # Casting to a list to avoid changing the dict while iterating over it.
        removal_keys = list(self._removals.keys())
        for key in removal_keys:
            removal = RemovalKey.from_bytes(key)
            if removal.movement.timestamp > as_of:
                break
            self._remove_entry(removal.removing)
            self._removals.pop(key)

    def start_history(self):
        self._retaining_entries = True

    def stop_history(self):
        self._retaining_entries = False
        self.drop_history()

    def save_signing_key(self, signing_key: SigningKey):
        self._signing_keys[signing_key.verify_key] = signing_key

    def get_signing_key(self, verify_key: VerifyKey) -> SigningKey:
        self._signing_keys[verify_key]

    def get_verify_key(self, chain: Chain, *_) -> VerifyKey:
        return self._verify_keys[chain]

    def get_container(self, container: Muid) -> Optional[ContainerBuilder]:
        return self._containers.get(container)

    def _get_file_path(self) -> Optional[Path]:
        return None

    def list_containers(self) -> Iterable[Tuple[Muid, ContainerBuilder]]:
        for key, val in self._containers.items():
            assert isinstance(key, Muid)
            assert isinstance(val, ContainerBuilder)
            yield key, val

    def get_comment(self, *, medallion: Medallion, timestamp: MuTimestamp) -> Optional[str]:
        look_for = BundleInfo(timestamp=timestamp, medallion=medallion)
        for thing in self._bundles.irange(minimum=look_for):
            assert isinstance(thing, BundleInfo)
            if thing.timestamp == timestamp and thing.medallion == medallion:
                return thing.comment
            else:
                return None
        raise Exception("unexpected")

    def _add_claim(self, _: Lock, chain: Chain, /) -> ClaimBuilder:
        claim_builder = create_claim(chain)
        self._claims[chain.medallion] = claim_builder
        return claim_builder

    def get_edge_entries(
            self, *,
            as_of: MuTimestamp,
            edge_type: Optional[Muid] = None,
            source: Optional[Muid] = None,
            target: Optional[Muid] = None) -> Iterable[FoundEntry]:
        if edge_type is None:
            raise NotImplementedError("edge scans without an edge type aren't currently supported in memory store")
        edge_type_bytes = bytes(edge_type)
        for placement_bytes in self._placements.irange(minimum=edge_type_bytes):
            if not placement_bytes.startswith(edge_type_bytes):
                break
            placement = Placement.from_bytes(placement_bytes, using=EDGE_TYPE)
            if placement.placer.timestamp > as_of:
                continue
            entry_muid = self._placements[placement_bytes]
            entry_builder: EntryBuilder = self._entries[entry_muid]
            # TODO: check for removals
            if source and source != Muid.create(builder=entry_builder.pair.left, context=entry_muid):
                continue
            if target and target != Muid.create(builder=entry_builder.pair.rite, context=entry_muid):
                continue
            yield FoundEntry(entry_muid, entry_builder)

    def get_entry(self, muid: Muid) -> Optional[EntryBuilder]:
        return self._entries.get(muid)

    def get_some(self, cls, last_index: Optional[int] = None):
        sorted_dict = {
            BundleBuilder: self._bundles,
            EntryBuilder: self._entries,
            MovementBuilder: self._removals,
            BundleInfo: self._bundles,
            Placement: self._placements,
            RemovalKey: self._removals,
            LocationKey: self._locations,
        }[cls]
        if last_index is None:
            last_index = 2 ** 52
        assert isinstance(last_index, int)
        remaining = (last_index if last_index >= 0 else ~last_index) + 1
        for key in sorted_dict.irange(reverse=last_index < 0):
            if remaining == 0:
                return
            remaining -= 1
            if isinstance(key, cls):
                yield key
            elif issubclass(cls, Message):
                val = sorted_dict[key]
                if isinstance(val, bytes):
                    instance = cls()
                    instance.ParseFromString(val)
                    yield instance
                else:
                    assert isinstance(val, cls)
                    yield val
            elif isinstance(key, bytes):
                yield cls.from_bytes(key)  # type: ignore
            else:
                raise ValueError(f"don't know what to do with {key}")

    def get_keyed_entries(self, container: Muid, behavior: int, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        as_of_muid = Muid(timestamp=as_of, medallion=-1, offset=-1)
        cont_bytes = bytes(container)
        clearance_time = None
        for clearance_key in self._clearances.irange(
                minimum=cont_bytes, maximum=cont_bytes + bytes(as_of_muid), reverse=True):
            clearance_time = Muid.from_bytes(clearance_key[16:32]).timestamp

        iterator = self._placements.irange(
            minimum=cont_bytes, maximum=cont_bytes + b"\xFF"*16, reverse=True)
        last = None
        # TODO this could be more efficient
        for entry_key in iterator:
            entry_storage_key = Placement.from_bytes(entry_key, behavior)
            if entry_storage_key.placer.timestamp >= as_of > 0:
                continue
            if entry_storage_key.middle == last:
                continue
            if clearance_time and entry_storage_key.placer.timestamp < clearance_time:
                last = entry_storage_key.middle
                continue
            if entry_storage_key.expiry and entry_storage_key.expiry < as_of:
                last = entry_storage_key.middle
                continue
            yield FoundEntry(builder=self._entries[self._placements[entry_key]],
                             address=entry_storage_key.placer)
            last = entry_storage_key.middle

    def get_entry_by_key(self, container: Muid, key: Union[UserKey, Muid, None, Tuple[Muid, Muid]],
                         as_of: MuTimestamp) -> Optional[FoundEntry]:
        as_of_muid = Muid(timestamp=as_of, medallion=0, offset=0)
        clearance_time = 0
        for clearance_key in self._clearances.irange(
                minimum=bytes(container), maximum=bytes(container) + bytes(as_of_muid), reverse=True):
            clearance_time = Muid.from_bytes(clearance_key[16:32]).timestamp
        epoch_muid = Muid(0, 0, 0)
        minimum = bytes(Placement(container, key, epoch_muid, None))
        maximum = bytes(Placement(container, key, as_of_muid, None))
        iterator = self._placements.irange(
            minimum=minimum,
            maximum=maximum, reverse=True)
        for encoded_entry_storage_key in iterator:
            entry_muid = self._placements[encoded_entry_storage_key]
            builder = self._entries[entry_muid]
            entry_storage_key = Placement.from_bytes(
                encoded_entry_storage_key, builder)
            if clearance_time > entry_storage_key.placer.timestamp:
                return None
            return FoundEntry(address=entry_storage_key.placer, builder=builder)
        return None

    def _get_claims(self, _: Lock, /) -> Mapping[Medallion, ClaimBuilder]:
        return self._claims

    def _refresh_helper(self, lock: Lock, callback: Optional[Callable[[BundleWrapper], None]]=None, /) -> int:
        return 0

    def get_ordered_entries(
            self,
            container: Muid,
            as_of: MuTimestamp,
            limit: Optional[int] = None,
            offset: int = 0,
            desc: bool = False,
    ) -> Iterable[PositionedEntry]:

        prefix = bytes(container)
        as_of_muid = Muid(as_of, 0, 0)
        clearance_time = 0
        for clearance_key in self._clearances.irange(
                minimum=prefix, maximum=prefix + bytes(as_of_muid), reverse=True):
            clearance_time = Muid.from_bytes(clearance_key[16:32]).timestamp
        removals_suffix = b"\xFF" * 16
        for placement_bytes in self._placements.irange(prefix, prefix + encode_muts(as_of), reverse=desc):
            if limit is not None and limit <= 0:
                break
            entry_muid = self._placements.get(placement_bytes)
            entry_builder = self._entries[entry_muid]
            placement_key = Placement.from_bytes(placement_bytes, SEQUENCE)
            placed_time = placement_key.get_placed_time()
            if placed_time >= as_of or placed_time < clearance_time:
                continue
            if placement_key.expiry and placement_key.expiry < as_of:
                continue
            removals_prefix = prefix + bytes(placement_key.get_positioner())
            found_removal = False
            for rkey in self._removals.irange(removals_prefix, removals_prefix + removals_suffix):
                found_removal = Muid.from_bytes(rkey[32:]).timestamp < as_of
                break
            if found_removal:
                continue
            # If we got here, then we know the entry is active at the as_of time.
            if offset > 0:
                offset -= 1
                continue
            middle = placement_key.middle
            assert isinstance(middle, QueueMiddleKey)
            yield PositionedEntry(
                position=middle.effective_time,
                positioner=placement_key.get_positioner(),
                entry_muid=entry_muid,
                builder=entry_builder)
            if limit is not None:
                limit -= 1

    def apply_bundle(
            self,
            bundle: Union[BundleWrapper, bytes],
            callback: Optional[Callable[[BundleWrapper], None]]=None,
            claim_chain: bool=False,
            ) -> bool:
        if isinstance(bundle, bytes):
            bundle = BundleWrapper(bundle)
        assert isinstance(bundle, BundleWrapper)
        bundle_builder = bundle.get_builder()
        new_info = bundle.get_info()
        chain_key = new_info.get_chain()
        old_info = self._chain_infos.get(new_info.get_chain())
        needed = is_needed(new_info, old_info)
        if needed:
            if new_info.chain_start == new_info.timestamp:
                self._identities[chain_key] = new_info.comment
                verify_key = VerifyKey(bundle_builder.verify_key)
                self._verify_keys[chain_key] = verify_key
            else:
                verify_key = self._verify_keys[chain_key]
                assert old_info is not None and old_info.hex_hash is not None
                prior_hash = bundle_builder.prior_hash
                if prior_hash != bytes.fromhex(old_info.hex_hash):
                    raise ValueError("prior_hash doesn't match hash of prior bundle")
            verify_key.verify(bundle.get_bytes())
            self._bundles[new_info] = bundle
            self._chain_infos[chain_key] = new_info
            change_items: Iterable[Tuple[int, ChangeBuilder]] = enumerate(bundle_builder.changes, start=1)
            for offset, change in change_items:
                try:
                    if change.HasField("container"):
                        container_muid = Muid.create(
                            context=new_info, offset=offset)
                        self._containers[container_muid] = change.container
                        continue
                    if change.HasField("entry"):
                        container = change.entry.container
                        muid = Muid(container.timestamp, container.medallion, container.offset)
                        if not muid in self._seen_containers:
                            if not self.get_container(muid):
                                container_builder = ContainerBuilder()
                                container_builder.behavior = change.entry.behavior
                                self._containers[muid] = container_builder
                                self._seen_containers.add(muid)
                        self._add_entry(new_info=new_info, offset=offset, entry_builder=change.entry)
                        continue
                    if change.HasField("movement"):
                        self._add_movement(new_info=new_info, offset=offset, builder=change.movement)
                        continue
                    if change.HasField("clearance"):
                        self._add_clearance(new_info=new_info, offset=offset, builder=change.clearance)
                        continue
                    raise ValueError(f"didn't recognize change: {new_info} {offset} {change}")
                except ValueError as value_error:
                    self._logger.error("problem processing change: %s", value_error)
        if needed and callback is not None:
            callback(bundle)
        return needed

    def _acquire_lock(self) -> bool:
        return False

    def _release_lock(self, _, /):
        pass

    def get_identity(self, chain: Chain, lock: Optional[bool]=None, /) -> str:
        return self._identities[chain]

    def find_chain(self, medallion: Medallion, timestamp: MuTimestamp) -> Chain:
        for chain in self._identities.irange(reverse=True,
            minimum=Chain(medallion=medallion, chain_start=0),
            maximum=Chain(medallion=medallion+1, chain_start=0)):
            assert isinstance(chain, Chain)
            if chain.medallion == medallion and timestamp >= chain.chain_start:
                return chain
        raise ValueError("chain not found")

    def _add_clearance(self, new_info: BundleInfo, offset: int, builder: ClearanceBuilder):
        container_muid = Muid.create(builder=getattr(builder, "container"), context=new_info)
        clearance_muid = Muid.create(context=new_info, offset=offset)
        new_key = bytes(container_muid) + bytes(clearance_muid)
        self._clearances[new_key] = builder

    def _add_movement(self, new_info: BundleInfo, offset: int, builder: MovementBuilder):
        container = Muid.create(builder=getattr(builder, "container"), context=new_info)
        entry_muid = Muid.create(builder=getattr(builder, "entry"), context=new_info)
        movement_muid = Muid.create(context=new_info, offset=offset)
        dest = getattr(builder, "dest")
        old_serialized_placement = self._get_entry_location(entry_muid)
        if not old_serialized_placement:
            self._logger.warning(f"could not find location for {entry_muid}")
            return
        old_placement_key = Placement.from_bytes(old_serialized_placement, SEQUENCE)
        entry_expiry = old_placement_key.expiry
        if entry_expiry and entry_expiry < movement_muid.timestamp:
            self._logger.warning(f"won't move exipired entry: {entry_muid}")
            return  # refuse to move an entry that's expired
        if movement_muid.timestamp < old_placement_key.get_placed_time():
            # I'm intentionally ignoring the case where a past (re)move shows up after a later one.
            # This means that while the present state will always converge, the history might not.
            self._logger.warning(f"movement comes after placed time, won't move {entry_muid}")
            return
        removal_key = RemovalKey(container, old_placement_key.get_positioner(), movement_muid)
        self._removals[bytes(removal_key)] = builder
        new_location_key = LocationKey(entry_muid, movement_muid)
        if dest:
            middle = QueueMiddleKey(dest)
            new_placement_key = Placement(container, middle, movement_muid, entry_expiry)
            new_serialized_esk = bytes(new_placement_key)
            self._placements[new_serialized_esk] = self._placements[old_serialized_placement]
            self._locations[new_location_key] = new_serialized_esk
        else:
            self._locations[new_location_key] = None

    def _add_entry(self, new_info: BundleInfo, offset: int, entry_builder: EntryBuilder):
        placement = Placement.from_builder(entry_builder, new_info, offset)
        entry_muid = placement.placer
        container_muid = placement.container
        encoded_placement_key = bytes(placement)
        if new_entries_replace(entry_builder.behavior):
            found_entry = self.get_entry_by_key(container_muid, placement.middle, as_of=generate_timestamp())
            if found_entry:
                if self._retaining_entries:
                    removal_key = RemovalKey(container_muid, found_entry.address, entry_muid)
                    self._removals[bytes(removal_key)] = b""
                else:
                    self._remove_entry(found_entry.address)

        self._entries[entry_muid] = entry_builder
        self._placements[encoded_placement_key] = entry_muid
        entries_location_key = LocationKey(placement.placer, placement.placer)
        self._locations[entries_location_key] = encoded_placement_key
        container_muid = placement.container
        if entry_builder.HasField("describing"):
            describing_muid = Muid.create(new_info, entry_builder.describing)
            self._by_describing[bytes(describing_muid) + bytes(entry_muid)] = bytes(container_muid)
        if container_muid == Muid(-1, -1, PROPERTY):
            if entry_builder.HasField("value") and entry_builder.HasField("describing"):
                describing_muid = Muid.create(new_info, entry_builder.describing)
                name = decode_value(entry_builder.value)
                if isinstance(name, str):
                    by_name_key = name.encode() + b"\x00" + bytes(entry_muid)
                    self._by_name[by_name_key] = bytes(describing_muid)
        if entry_builder.HasField("describing") and entry_builder.HasField("deletion"):
            if container_muid == Muid(-1, -1, PROPERTY):
                iterator = self._by_name.irange(
                    minimum = b"\x00" + bytes(entry_muid),
                    maximum = b"\xFF"*16 + b"\x00" + bytes(entry_muid),
                    reverse=True
                )
                for key in iterator:
                    self._by_name.pop(key)
                    break

            describing_muid = Muid.create(new_info, entry_builder.describing)
            self._by_describing.pop(bytes(describing_muid) + bytes(entry_muid))

    def _remove_entry(self, entry_muid: Muid):
        entry_builder = self._entries.pop(entry_muid)
        if entry_builder is None:
            self._logger.warning(f"entry already gone? {entry_muid}")
            return
        min_location = LocationKey(entry_muid, Muid(0, 0, 0))
        iterator = self._locations.irange(minimum=min_location)
        # just need the first entry found
        for location_key in iterator:
            assert location_key.entry_muid == entry_muid
            self._placements.pop(self._locations[location_key])
            self._locations.pop(location_key)
            break
        container_muid = Muid.create(entry_muid, entry_builder.container)
        if container_muid == Muid(-1, -1, PROPERTY):
            if entry_builder.HasField("value") and entry_builder.HasField("describing"):
                name = decode_value(entry_builder.value)
                if isinstance(name, str):
                    by_name_key = name.encode() + b"\x00" + bytes(entry_muid)
                    self._by_name.pop(by_name_key)

    def get_bundles(
        self,
        callback: Callable[[BundleWrapper], None], *,
        limit_to: Optional[Mapping[Chain, Limit]] = None,
        **_
    ):
        start_scan_at: MuTimestamp = 0
        for bundle_info in self._bundles.irange(minimum=BundleInfo(timestamp=start_scan_at)):
            if limit_to is None or bundle_info.timestamp <= limit_to.get(bundle_info.get_chain(), 0):
                bundle_wrapper = self._bundles[bundle_info]
                callback(bundle_wrapper)

    def get_chain_tracker(self, limit_to: Optional[Mapping[Chain, Limit]]=None) -> ChainTracker:
        chain_tracker = ChainTracker()
        for bundle_info in self._chain_infos.values():
            assert isinstance(bundle_info, BundleInfo)
            chain_tracker.mark_as_having(bundle_info)
        if limit_to is not None:
            chain_tracker = chain_tracker.get_subset(limit_to.keys())
        return chain_tracker

    def get_last(self, chain: Chain) -> BundleInfo:
        return self._chain_infos[chain]

    def _get_entry_location(self, entry_muid: Muid, as_of: MuTimestamp = -1) -> Optional[bytes]:
        # bkey = bytes(entry_muid)
        for location_key in self._locations.irange(
                LocationKey(entry_muid, Muid(0, 0, 0)),
                LocationKey(entry_muid, Muid(as_of, -1, -1)), reverse=True):
            return self._locations[location_key]
        return None

    def get_positioned_entry(self, entry: Muid, as_of: MuTimestamp = -1) -> Optional[PositionedEntry]:
        location = self._get_entry_location(entry, as_of)
        if location is None:
            return None
        entry_builder = self._entries[self._placements[location]]
        placement_key = Placement.from_bytes(location, entry_builder)
        middle = placement_key.middle
        assert isinstance(middle, QueueMiddleKey)
        return PositionedEntry(middle.effective_time,
                               placement_key.placer,
                               placement_key.placer, entry_builder)

    def get_reset_changes(self, to_time: MuTimestamp, container: Optional[Muid],
                          user_key: Optional[UserKey], recursive=False) -> Iterable[ChangeBuilder]:
        return self.get_directory_reset_changes(
            to_time=to_time, container=container, user_key=user_key, recursive=recursive)

    def get_directory_reset_changes(
            self,
            container: Optional[Muid],
            user_key: Optional[UserKey] = None,
            to_time: MuTimestamp = -1,
            recursive: Union[bool, set] = False) -> Iterable[ChangeBuilder]:
        if container is None and user_key is not None:
            raise ValueError("Can't specify key without specifying container.")
        if container is None:
            recursive = False
        if recursive is True:
            recursive = set()
            recursive.add(container)

        if user_key is not None and container is not None:  # Reset specific key for directory
            now_entry = self.get_entry_by_key(container=container, key=user_key, as_of=0)
            then_entry = self.get_entry_by_key(container=container, key=user_key, as_of=to_time)

            if now_entry != then_entry:
                # If there is an entry, but it is different from current
                if isinstance(then_entry, Deletion):
                    # Handles entry that was deleted
                    yield wrap_change(create_deleting_entry(container, key=user_key, behavior=DIRECTORY))
                else:
                    yield wrap_change(then_entry.builder)  # type: ignore

        elif user_key is None and container is not None:  # Reset whole container
            now_set = set(self.get_keyed_entries(container=container, as_of=-1, behavior=DIRECTORY))
            then_set = set(self.get_keyed_entries(container=container, as_of=to_time, behavior=DIRECTORY))

            now_decoded = {decode_key(now.builder.key): decode_entry_occupant(now.address, now.builder)
                           for now in now_set}
            then_decoded = {decode_key(then.builder.key): decode_entry_occupant(then.address, then.builder)
                            for then in then_set}

            if now_decoded == then_decoded:
                return

            for now_entry in now_set:
                key = decode_key(now_entry.builder.key)
                value = now_decoded[key]
                if key not in then_decoded.keys() and not isinstance(value, Deletion):
                    # Deletes entries that were not present then
                    yield wrap_change(
                        create_deleting_entry(container, key=decode_key(now_entry.builder.key), behavior=DIRECTORY))

            for then_entry in then_set:
                key = decode_key(then_entry.builder.key)
                value = then_decoded[key]
                if isinstance(value, Muid) and isinstance(recursive, set):  # If entry points to another container
                    if value not in recursive:
                        for change in self.get_directory_reset_changes(value, to_time=to_time, recursive=recursive):
                            yield change
                        recursive.add(value)
                elif isinstance(value, Deletion):
                    # Handles entry that was deleted
                    yield wrap_change(create_deleting_entry(container, key=key, behavior=DIRECTORY))

                elif key in now_decoded.keys():  # Same key then and now
                    if now_decoded[key] != value:
                        yield wrap_change(then_entry.builder)
                else:  # Key does not exist now, need to create entry
                    yield wrap_change(then_entry.builder)
        else:
            raise NotImplementedError()

    def get_by_name(self, name, as_of: MuTimestamp = -1) -> Iterable[FoundContainer]:
        """ Returns info about all things with the given name. """
        as_of_muid = Muid(timestamp=as_of, medallion=-1, offset=-1)
        prop_bytes = bytes(Muid(-1, -1, PROPERTY))
        key_min = name.encode() + b"\x00"
        key_max = name.encode() + b"\x00" + bytes(as_of_muid)
        clearance_time = 0
        for clearance_key in self._clearances.irange(
                minimum=prop_bytes, maximum=prop_bytes + bytes(as_of_muid), reverse=True):
            clearance_time = Muid.from_bytes(clearance_key[16:32]).timestamp

        iterator = self._by_name.irange(
            minimum=key_min, maximum=key_max + b"\xFF"*16, reverse=True)
        for encoded_by_name_key in iterator:
            describing_muid = Muid.from_bytes(self._by_name[encoded_by_name_key])
            if describing_muid.timestamp == -1:
                container_builder = ContainerBuilder()
                container_builder.behavior = describing_muid.offset
            else:
                container_builder = self._containers[describing_muid]
            entry_muid = Muid.from_bytes(encoded_by_name_key[-16:])
            if not clearance_time > entry_muid.timestamp:
                yield FoundContainer(address=describing_muid, builder=container_builder)

    def get_by_describing(self, desc: Muid, as_of: MuTimestamp = -1) -> Iterable[FoundEntry]:
        min = bytes(desc)
        as_of_muid = Muid(timestamp=as_of, medallion=-1, offset=-1)
        max = bytes(desc) + bytes(as_of_muid)

        iterator = self._by_describing.irange(
            minimum=min, maximum=max, reverse=True)
        for encoded_by_describing_key in iterator:
            if not min in encoded_by_describing_key:
                break
            container_muid_bytes = self._by_describing[encoded_by_describing_key]
            clearance_time = 0
            for clearance_key in self._clearances.irange(
                    minimum=container_muid_bytes,
                    maximum=container_muid_bytes + bytes(as_of_muid),
                    reverse=True
            ):
                clearance_time = Muid.from_bytes(clearance_key[16:32]).timestamp
            entry_muid = Muid.from_bytes(encoded_by_describing_key[-16:])
            entry_builder = self._entries[entry_muid]
            if not clearance_time > entry_muid.timestamp:
                yield FoundEntry(address=entry_muid, builder=entry_builder)
