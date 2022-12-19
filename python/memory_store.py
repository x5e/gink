""" Contains the MemoryStore class, and implementation of the AbstractStore interface. """

# standard python stuff
from typing import Tuple, Callable, Optional, Iterable
import json
from sortedcontainers import SortedDict, SortedSet

# generated protobuf builder
from change_set_pb2 import ChangeSet as ChangeSetBuilder

# gink modules
from typedefs import UserKey, MuTimestamp
from tuples import Chain, EntryAddressAndBuilder
from change_set_info import ChangeSetInfo
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from muid import Muid


class MemoryStore(AbstractStore):
    """ Stores the data for a Gink database in memory.

        (Primarily for use in testing and to be used as a base clase.)
    """
    _change_sets: SortedDict  # ChangeSetInfo => bytes
    _chain_infos: SortedDict # Chain => ChangeSetInfo
    _claimed_chains: SortedSet # Chain
    _entries: SortedDict # (source muid, json.dumps(key), entry muid, expiry) => EntryBuilder
    _containers: SortedDict # muid => builder

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = SortedDict()
        self._claimed_chains = SortedSet()
        self._entries = SortedDict()
        self._containers = SortedDict()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[EntryAddressAndBuilder]:
        as_of_muid = Muid(timestamp=as_of, medallion=0, offset=0).invert()
        iterator = self._entries.irange(
            minimum=(container, ''), maximum=(container, chr(127)))
        last = None
        result = []
        for entry_key in iterator:
            (_, jkey, inverse_entry_muid, expiry) = entry_key
            if expiry and expiry < as_of:
                continue
            if jkey == last:
                continue
            if inverse_entry_muid < as_of_muid:
                continue
            pair = EntryAddressAndBuilder(builder=self._entries[entry_key], address=inverse_entry_muid.invert())
            result.append(pair)
            last = jkey
        return result

    def get_entry(self, container: Muid, key: UserKey, as_of: MuTimestamp) -> Optional[EntryAddressAndBuilder]:
        as_of_muid = Muid(timestamp=as_of, medallion=0, offset=0).invert()
        epoch_muid = Muid(0, 0, 0).invert()
        minimum=(container, json.dumps(key), as_of_muid)
        maximum=(container, json.dumps(key), epoch_muid)
        iterator = self._entries.irange(
            minimum=minimum,
            maximum=maximum)
        for ekey in iterator:
            assert isinstance(ekey, tuple)
            return EntryAddressAndBuilder(builder=self._entries[ekey], address=ekey[2].invert())
        return None

    def get_claimed_chains(self):
        return self._claimed_chains

    def claim_chain(self, chain: Chain):
        self._claimed_chains.add(chain)

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

    def _add_entry(self, new_info, offset, entry_builder):
        inner_key = "null"
        if entry_builder.HasField("key"):
            if entry_builder.key.HasField("characters"):
                inner_key = json.dumps(entry_builder.key.characters)
            elif entry_builder.key.HasField("number"):
                inner_key = json.dumps(entry_builder.key.number)
            else:
                raise ValueError("bad key")
        src_muid = Muid.create(entry_builder.container, context=new_info)
        entry_muid = Muid.create(context=new_info, offset=offset).invert()
        dict_key = (src_muid, inner_key, entry_muid, entry_builder.expiry)
        self._entries[dict_key] = entry_builder

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
