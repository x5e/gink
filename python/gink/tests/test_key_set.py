#!/usr/bin/env python3
""" test the KeySet class """
from contextlib import closing
from ..impl.muid import Muid
from ..impl.key_set import KeySet
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore
from ..impl.utilities import generate_timestamp

def test_creation():
    """ test that I can create new key sets as well as proxies for existing ones """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            keyset1 = KeySet(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            keyset2 = KeySet()
            assert len(store.get_bundle_infos()) != 0
            assert keyset1 != keyset2

def test_add_update_contains():
    """ test that both adding one key or updating with multiple keys works as intended
        also tests contains works as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)

            bundler = Bundler("testing")
            gks.add("value1", bundler=bundler)
            database.bundle(bundler)
            infos = store.get_bundle_infos()
            assert len(infos) == 2, infos
            assert gks.contains("value1")

            gks.update(["value2", "value3"])
            assert gks.contains("value2")
            assert gks.contains("value3")

def test_from_contents():
    """ tests that creating key sets from contents works """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            ks = KeySet(database=database, contents=["key1", "key2", 3])

            assert ks.size() == 3
            assert ks.contains(3)
            assert ks.contains("key1")

def test_discard_remove_pop():
    """ tests that all delete methods work as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)

            # Tests discard correctly removes element from set
            gks.update(["value1", "value2"])
            assert gks.contains("value2")
            gks.discard("value2")
            assert not gks.contains("value2")

            # Tests that remove correctly removes element, and returns KeyError if element not found
            gks.update(["value2", "value3"])
            assert gks.contains("value3")
            gks.remove("value3")
            assert not gks.contains("value3")
            try:
                gks.remove("not in set")
                raise AssertionError()
            except KeyError:
                assert gks.contains("value2")

            # Tests that pop correcly removes an element and returns it
            assert gks.pop("value2") == "value2"
            assert not gks.contains("value2")

def test_super_subset_disjoint():
    """ tests that issuperset, issubset, and isdisjoint all work as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)

            gks.update(["value1", "value2", "value3"])
            assert gks.issuperset(["value2", "value3"])
            assert gks.issubset(["value1", "value2", "value3", "value4"])
            assert not gks.isdisjoint(["value1", "value2", "value4"])
            assert gks.isdisjoint(["value4", "value5", "value6"])

def test_diff_inter_symdiff_union():
    """ tests that difference, intersection, symmetric_difference, and union methods work as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)

            gks.update(["value1", "value2", "value3"])
            assert set(gks.difference(["value2", "value3"])) == {"value1"}
            assert set(gks.intersection(["value2", "value3"])) == {"value2", "value3"}
            assert gks.symmetric_difference(["value2", "value4"]) == {"value1", "value3", "value4"}
            assert gks.union(["value4", "value5"]) == {"value1", "value2", "value3", "value4", "value5"}

def test_diff_inter_symdiff_updates():
    """ tests that the update methods for difference_update, intersection_update, and
        symmetric_difference_update work as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)

            gks.update(["value1", "value2", "value3"])

            gks.difference_update(["value1", "value2"])
            assert set(gks.items()) == {"value3"}

            gks.add("value0")
            assert set(gks.items()) == {"value0", "value3"}

            gks.intersection_update(["value3", "value4", "value5"])
            assert set(gks.items()) == {"value3"}

            gks.symmetric_difference_update(["value1", "value2", "value3", "value4"])
            # print(set(gks.items()))
            assert set(gks.items()) == {"value1", "value2", "value4"}

def test_asof():
    """ tests as_of works for most methods """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)
            gks.update(["value1", "value2", "value3"])
            gks.add("value4")
            after4 = generate_timestamp()

            # Tests as_of for items
            assert set(gks.items(as_of=None)) == {"value1", "value2", "value3", "value4"}
            assert set(gks.items(as_of=-1)) == {"value1", "value2", "value3"}

            # Tests as_of for superset, subset, and disjoint
            assert gks.issuperset(["value2", "value3"], as_of=-1)
            assert gks.issuperset(["value3", "value4"])
            assert gks.issubset(["value1", "value2", "value3", "value4"], as_of=-1)
            assert not gks.isdisjoint(["value1", "value2", "value4"], as_of=-1)
            assert gks.isdisjoint(["value4", "value5", "value6"], as_of=-1)

            # Tests as_of for difference, intersection, symmetric_difference, and union
            assert set(gks.difference(["value2", "value3"], as_of=-1)) == {"value1"}
            assert set(gks.intersection(["value2", "value3"], as_of=-1)) == {"value2", "value3"}
            assert gks.symmetric_difference(["value2", "value4"], as_of=-1) == {"value1", "value3", "value4"}
            assert gks.union(["value4", "value5"], as_of=-1) == {"value1", "value2", "value3", "value4", "value5"}

            # Testing as_of with a resolved timestamp in microseconds
            gks.update(["value5", "value6"])
            assert set(gks.items(as_of=after4)) == {"value1", "value2", "value3", "value4"}

def test_size():
    """ tests that the size methods works as intended """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            gks = KeySet.get_global_instance(database=database)
            gks.update(["value1", "value2", "value3"])

            assert gks.size() == 3
            gks.add("value4")
            assert gks.size() == 4
            assert gks.size(as_of=-1) == 3
