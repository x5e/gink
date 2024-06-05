#!/usr/bin/env python3
""" test the PairSet class """
from contextlib import closing
from ..impl.muid import Muid
from ..impl.pair_set import PairSet
from ..impl.graph import Vertex
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.abstract_store import AbstractStore
from ..impl.utilities import generate_timestamp

def test_creation():
    """ test that I can create new pair sets """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            pairset1 = PairSet(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            pairset2 = PairSet()
            assert len(store.get_bundle_infos()) != 0
            assert pairset1 != pairset2

            vertex1 = Vertex()
            vertex2 = Vertex()
            vertex3 = Vertex()
            pairset3 = PairSet(contents=[(vertex1, vertex2), (vertex2, vertex3), (vertex1, vertex3)])
            assert pairset3.size() == 3

def test_include_exclude():
    """ test that including and excluding pairs of vertexs works properly """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            vertex1 = Vertex(database=database)
            vertex2 = Vertex(database=database)
            pairset1 = PairSet(database=database)
            assert pairset1.size() == 0

            pairset1.include(pair=(vertex1, vertex2))
            assert pairset1.size() == 1

            vertex3 = Vertex(database=database)
            as_of = generate_timestamp()
            pairset1.include(pair=(vertex1, vertex3))
            assert pairset1.size() == 2

            pairset1.exclude(pair=(vertex1, vertex2))
            assert pairset1.size() == 1

            pairset1.include(pair=(vertex2, vertex3))
            assert pairset1.size() == 2

            pairset1.exclude(pair=(vertex2, vertex3))
            assert pairset1.size() == 1

def test_reset_asof():
    """ tests as_of and reset work as intended. Currently only testing as_of"""
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            vertex1 = Vertex(database=database)
            vertex2 = Vertex(database=database)
            pairset1 = PairSet(database=database)
            assert pairset1.size() == 0

            pairset1.include(pair=(vertex1, vertex2))
            assert pairset1.size() == 1

            vertex3 = Vertex(database=database)
            pairset1.include(pair=(vertex1, vertex3))
            assert pairset1.size() == 2

            # assert pairset1.size(as_of=as_of) == 1
            # pairset1.reset(as_of)
            # assert pairset1.size() == 1

def test_dumps():
    """ tests the dumps method evals back into an object """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            vertex1 = Vertex(database=database)
            vertex2 = Vertex(database=database)
            vertex3 = Vertex(database=database)
            pairset1 = PairSet(contents=[(vertex1, vertex2), (vertex1, vertex3), (vertex2, vertex3)], database=database)
            assert pairset1.size() == 3
            dump = pairset1.dumps()

            pairset2 = eval(dump)
            assert pairset2.size() == 3

def test_contains_getpairs():
    """ tests the contains and get_pairs methods for pair sets """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            vertex1 = Vertex(database=database)
            vertex2 = Vertex(database=database)
            vertex3 = Vertex(database=database)
            pairset1 = PairSet(contents=[(vertex1, vertex2), (vertex1, vertex3), (vertex2, vertex3)], database=database)
            assert pairset1.size() == 3

            assert pairset1.contains(pair=(vertex1, vertex2))
            assert pairset1.__contains__(pair=(vertex1, vertex2))
            assert pairset1.contains(pair=(vertex1._muid, vertex2._muid))

            assert pairset1.get_pairs() == {(vertex1._muid, vertex2._muid),
                                            (vertex1._muid, vertex3._muid), (vertex2._muid, vertex3._muid)}
