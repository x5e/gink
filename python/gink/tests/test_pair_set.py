#!/usr/bin/env python3
""" test the PairSet class """
from contextlib import closing
from ..impl.muid import Muid
from ..impl.pair_set import PairSet
from ..impl.graph import Noun
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.abstract_store import AbstractStore
from ..impl.patch import PATCHED

assert PATCHED

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

            noun1 = Noun()
            noun2 = Noun()
            noun3 = Noun()
            pairset3 = PairSet(contents=[(noun1, noun2), (noun2, noun3), (noun1, noun3)])
            assert pairset3.size() == 3

def test_include_exclude():
    """ test that including and excluding pairs of nouns works properly """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            noun1 = Noun(database=database)
            noun2 = Noun(database=database)
            pairset1 = PairSet(database=database)
            assert pairset1.size() == 0

            pairset1.include(pair=(noun1, noun2))
            assert pairset1.size() == 1

            noun3 = Noun(database=database)
            as_of = database.get_now()
            pairset1.include(pair=(noun1, noun3))
            assert pairset1.size() == 2

            pairset1.exclude(pair=(noun1, noun2))
            assert pairset1.size() == 1

            pairset1.include(pair=(noun2, noun3))
            assert pairset1.size() == 2

            pairset1.exclude(pair=(noun2, noun3))
            assert pairset1.size() == 1

def test_reset_asof():
    """ tests as_of and reset work as intended. Currently only testing as_of"""
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            noun1 = Noun(database=database)
            noun2 = Noun(database=database)
            pairset1 = PairSet(database=database)
            assert pairset1.size() == 0

            pairset1.include(pair=(noun1, noun2))
            assert pairset1.size() == 1
            as_of = database.get_now()

            noun3 = Noun(database=database)
            pairset1.include(pair=(noun1, noun3))
            assert pairset1.size() == 2

            # assert pairset1.size(as_of=as_of) == 1
            # pairset1.reset(as_of)
            # assert pairset1.size() == 1

def test_dumps():
    """ tests the dumps method evals back into an object """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            noun1 = Noun(database=database)
            noun2 = Noun(database=database)
            noun3 = Noun(database=database)
            pairset1 = PairSet(contents=[(noun1, noun2), (noun1, noun3), (noun2, noun3)], database=database)
            assert pairset1.size() == 3
            dump = pairset1.dumps()

            pairset2 = eval(dump)
            assert pairset2.size() == 3

def test_contains_getpairs():
    """ tests the contains and get_pairs methods for pair sets """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            noun1 = Noun(database=database)
            noun2 = Noun(database=database)
            noun3 = Noun(database=database)
            pairset1 = PairSet(contents=[(noun1, noun2), (noun1, noun3), (noun2, noun3)], database=database)
            assert pairset1.size() == 3

            assert pairset1.contains(pair=(noun1, noun2))
            assert pairset1.__contains__(pair=(noun1, noun2))
            assert pairset1.contains(pair=(noun1._muid, noun2._muid))

            assert pairset1.get_pairs() == {(noun1._muid, noun2._muid),
                                            (noun1._muid, noun3._muid), (noun2._muid, noun3._muid)}
