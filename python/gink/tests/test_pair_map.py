#!/usr/bin/env python3
""" test the PairSet class """
from contextlib import closing
from ..impl.muid import Muid
from ..impl.pair_map import PairMap
from ..impl.graph import Noun
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore
from ..impl.patch import PATCHED

assert PATCHED

def test_creation():
    """ test that I can create new pair maps """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            pairmap1 = PairMap(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            pairmap2 = PairMap()
            assert len(store.get_bundle_infos()) != 0
            assert pairmap1 != pairmap2

def test_set_get():
    """ test that set and get methods work properly """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            pairmap1 = PairMap(database=database)

            noun1 = Noun()
            noun2 = Noun()
            pairmap1.set(key=(noun1, noun2), value="test noun1 -> noun2")

            assert pairmap1.get(key=(noun1, noun2)) == "test noun1 -> noun2"
