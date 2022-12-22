""" Contains the MemoryStore class, and implementation of the AbstractStore interface. """

# standard python stuff
from typing import Tuple, Callable, Optional, Iterable
import json
from sortedcontainers import SortedDict

# generated protobuf builder
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from entry_pb2 import Entry as EntryBuilder

# gink modules
from typedefs import UserKey, MuTimestamp
from tuples import Chain, FoundEntry, PositionedEntry
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from muid import Muid
from coding import EntryStorageKey, SCHEMA


class MemoryStore(AbstractStore):
    """ Stores the data for a Gink database in memory.

        (Primarily for use in testing and to be used as a base clase.)
    """
    _change_sets: SortedDict  # ChangeSetInfo => bytes
    _chain_infos: SortedDict # Chain => ChangeSetInfo
    _claimed_chains: SortedDict # Chain
    _entries: SortedDict # bytes(EntryStorageKey) => EntryBuilder
    _containers: SortedDict # muid => builder

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = SortedDict()
        self._claimed_chains = SortedDict()
        self._entries = SortedDict()
        self._containers = SortedDict()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[FoundEntry]:
        cont_bytes = bytes(container)
        iterator = self._entries.irange(minimum=cont_bytes, maximum=cont_bytes + b"\xFF")
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

    def get_entry(self, container: Muid, key: UserKey, as_of: MuTimestamp) -> Optional[FoundEntry]:
        as_of_muid = Muid(timestamp=as_of, medallion=0, offset=0)
        epoch_muid = Muid(0, 0, 0)
        minimum=bytes(EntryStorageKey(container, key, as_of_muid, None))
        maximum=bytes(EntryStorageKey(container, key, epoch_muid, None))
        iterator = self._entries.irange(
            minimum=minimum,
            maximum=maximum)
        for encoded_entry_storage_key in iterator:
            entry_storage_key = EntryStorageKey.from_bytes(encoded_entry_storage_key)
            builder = self._entries[encoded_entry_storage_key]
            return FoundEntry(address=entry_storage_key.entry_muid, builder=builder)
        return None

    def get_claimed_chains(self) -> Iterable[Chain]:
        for key, val in self._claimed_chains.items():
            yield Chain(key, val)

    def claim_chain(self, chain: Chain):
        self._claimed_chains[chain.medallion] = chain.chain_start

    def get_ordered_entries(self, container: Muid, as_of: MuTimestamp, limit: Optional[int]=None,
            offset: int=0, desc: bool=False) -> Iterable[PositionedEntry]:
        assert self or container or as_of or limit or offset or desc
        raise NotImplementedError()

    def add_commit(self, change_set_bytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        change_set_builder = ChangeSetBuilder()
        change_set_builder.ParseFromString(change_set_bytes)  # type: ignore
        new_info = ChangeSetInfo(builder=change_set_builder)
        chain_key = new_info.get_chain()
        old_info = self._chain_infos.get(new_info.get_chain())
        needed = AbstractStore._is_needed(new_info, old_info)
        if needed:
            self._change_sets[new_info] = change_set_bytes
            self._chain_infos[chain_key] = new_info
            for offset, change in change_set_builder.changes.items():   # type: ignore
                if change.HasField("container"):
                    container_muid = Muid.create(context=new_info, offset=offset)
                    self._containers[container_muid] = change.container
                    continue
                if change.HasField("entry"):
                    self._add_entry(new_info=new_info, offset=offset, entry_builder=change.entry)
                    continue
                raise AssertionError(f"{repr(change.ListFields())} {offset} {new_info}")
        return (new_info, needed)

    def _add_entry(self, new_info: ChangeSetInfo, offset: int, entry_builder: EntryBuilder):
        entry_storage_key = EntryStorageKey.from_builder(entry_builder, new_info, offset)
        self._entries[bytes(entry_storage_key)] = entry_builder

    def get_commits(self, callback: Callable[[bytes, ChangeSetInfo], None]):
        for change_set_info, data in self._change_sets.items():
            assert isinstance(change_set_info, ChangeSetInfo)
            assert isinstance(data, bytes)
            callback(data, change_set_info)

    def get_chain_tracker(self) -> ChainTracker:
        chain_tracker = ChainTracker()
        for change_set_info in self._chain_infos.values():
            assert isinstance(change_set_info, ChangeSetInfo)
            chain_tracker.mark_as_having(change_set_info)
        return chain_tracker
