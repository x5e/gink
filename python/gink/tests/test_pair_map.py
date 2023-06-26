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
    """ test that I can create new pair sets """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            pairset1 = PairMap(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            pairset2 = PairMap()
            assert len(store.get_bundle_infos()) != 0
            assert pairset1 != pairset2
