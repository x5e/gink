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

def test_basic():
    """ test that set, get, delete, and size methods work properly """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            pairmap1 = PairMap(database=database)

            noun1 = Noun()
            noun2 = Noun()
            noun3 = Noun()
            pairmap1.set(key=(noun1, noun2), value="test noun1 -> noun2")
            after_first = database.get_now()

            assert pairmap1.get(key=(noun1, noun2)) == "test noun1 -> noun2"
            assert pairmap1.has(key=(noun1, noun2))
            assert pairmap1.size() == 1

            pairmap1.set(key=(noun1, noun3), value="test noun1 -> noun3")
            assert pairmap1.size() == 2
            assert pairmap1.has(key=(noun1._muid, noun3._muid))

            pairmap1.delete(key=(noun1, noun2))
            assert pairmap1.size() == 1

            assert not pairmap1.get(key=(noun1, noun3), as_of=after_first)
            assert pairmap1.get(key=(noun1, noun2), as_of=after_first)
            assert pairmap1.get(key=(noun1, noun3)) == "test noun1 -> noun3"

            pairmap1.delete(key=(noun1, noun3))
            assert pairmap1.size() == 0

def test_contents_dumps():
    """ tests that creating a pair map with contents populates the entries
        also tests that eval(dumps) creates a new pair map with contents
    """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            noun1 = Noun()
            noun2 = Noun()
            noun3 = Noun()

            pairmap1 = PairMap(contents={
                (noun1, noun2): "test noun1 -> noun2",
                (noun2, noun3): "test noun2 -> noun3"},
                database=database)
            assert pairmap1.size() == 2

            items = list(pairmap1.items())
            assert items[0] == ((noun2._muid, noun3._muid), 'test noun2 -> noun3')
            assert items[1] == ((noun1._muid, noun2._muid), 'test noun1 -> noun2')

            pairmap2 = PairMap(contents={
                (noun1._muid, noun2._muid): "test noun1 -> noun2",
                (noun2._muid, noun3._muid): "test noun2 -> noun3"},
                database=database)
            assert pairmap2.size() == 2

            # Testing dumps eval
            dump = pairmap1.dumps()
            pairmap3 = eval(dump)
            assert pairmap3.size() == 2
