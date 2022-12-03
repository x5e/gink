""" Contains the MemoryStore class, and implementation of the AbstractStore interface. """

# standard python stuff
from typing import Tuple, Callable, Optional, Iterable
from sortedcontainers import SortedDict, SortedSet

# generated protobuf builder
from change_set_pb2 import ChangeSet as ChangeSetBuilder

# gink modules
from typedefs import Key, MuTimestamp
from tuples import Chain, EntryPair
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
    _entries: SortedDict # (source muid, repr(key), entry muid, expiry) => EntryPair
    _containers: SortedDict # muid => builder

    def __init__(self):
        self._change_sets = SortedDict()
        self._chain_infos = SortedDict()
        self._claimed_chains = SortedSet()
        self._entries = SortedDict()
        self._containers = SortedDict()

    def get_keyed_entries(self, container: Muid, as_of: MuTimestamp) -> Iterable[EntryPair]:
        raise NotImplementedError()

    def get_entry(self, container: Muid, key: Key, as_of: MuTimestamp) -> Optional[EntryPair]:
        end_muid = Muid(timestamp=as_of, medallion=0, offset=0)
        minimum=(container, repr(key))
        maximum=(container, repr(key), end_muid)
        iterator = self._entries.irange(
            minimum=minimum,
            maximum=maximum,
            reverse=True)
        for ekey in iterator:
            assert isinstance(ekey, tuple)
            # if len(key) == 4 and key[3] and key[3] < as_of
            return EntryPair(builder=self._entries[ekey], address=ekey[2])
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
                inner_key = repr(entry_builder.key.characters)
            elif entry_builder.key.HasField("number"):
                inner_key = repr(entry_builder.key.number)
            else:
                raise ValueError("bad key")
        src_muid = Muid.create(entry_builder.container, context=new_info)
        entry_muid = Muid.create(context=new_info, offset=offset)
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
