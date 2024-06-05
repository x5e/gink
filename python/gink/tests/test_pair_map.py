#!/usr/bin/env python3
""" test the PairSet class """
from contextlib import closing
from ..impl.muid import Muid
from ..impl.pair_map import PairMap
from ..impl.graph import Vertex
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.utilities import generate_timestamp
from ..impl.abstract_store import AbstractStore

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

            vertex1 = Vertex()
            vertex2 = Vertex()
            vertex3 = Vertex()
            pairmap1.set(key=(vertex1, vertex2), value="test vertex1 -> vertex2")
            after_first = generate_timestamp()

            assert pairmap1.get(key=(vertex1, vertex2)) == "test vertex1 -> vertex2"
            assert pairmap1.has(key=(vertex1, vertex2))
            assert pairmap1.size() == 1

            pairmap1.set(key=(vertex1, vertex3), value="test vertex1 -> vertex3")
            assert pairmap1.size() == 2
            assert pairmap1.has(key=(vertex1._muid, vertex3._muid))

            pairmap1.delete(key=(vertex1, vertex2))
            assert pairmap1.size() == 1

            assert not pairmap1.get(key=(vertex1, vertex3), as_of=after_first)
            assert pairmap1.get(key=(vertex1, vertex2), as_of=after_first)
            assert pairmap1.get(key=(vertex1, vertex3)) == "test vertex1 -> vertex3"

            pairmap1.delete(key=(vertex1, vertex3))
            assert pairmap1.size() == 0

def test_contents_dumps():
    """ tests that creating a pair map with contents populates the entries
        also tests that eval(dumps) creates a new pair map with contents
    """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            vertex1 = Vertex()
            vertex2 = Vertex()
            vertex3 = Vertex()

            pairmap1 = PairMap(contents={
                (vertex1, vertex2): "test vertex1 -> vertex2",
                (vertex2, vertex3): "test vertex2 -> vertex3"},
                database=database)
            assert pairmap1.size() == 2

            items = list(pairmap1.items())
            assert items[0] == ((vertex2._muid, vertex3._muid), 'test vertex2 -> vertex3')
            assert items[1] == ((vertex1._muid, vertex2._muid), 'test vertex1 -> vertex2')

            pairmap2 = PairMap(contents={
                (vertex1._muid, vertex2._muid): "test vertex1 -> vertex2",
                (vertex2._muid, vertex3._muid): "test vertex2 -> vertex3"},
                database=database)
            assert pairmap2.size() == 2

            # Testing dumps eval
            dump = pairmap1.dumps()
            pairmap3 = eval(dump)
            assert pairmap3.size() == 2
