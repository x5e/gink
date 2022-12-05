#!/usr/bin/env python3
""" test the directory class """
from muid import Muid
from directory import Directory
from memory_store import MemoryStore
from lmdb_store import LmdbStore
from database import Database
from change_set import ChangeSet

def test_creation():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with store:
            database = Database(store=store)
            directory1 = Directory(muid=Muid(1,2,3), database=database)
            assert len(store.get_commit_infos()) == 0

            directory2 = Directory()
            assert len(store.get_commit_infos()) != 0
            assert directory1 != directory2

def test_set_get():
    """ Test basic set/get functionality works. """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with store:
            database = Database(store=store)
            global_directory = Directory.global_instance(database=database)

            change_set = ChangeSet("testing")
            global_directory.set("foo", "bar", change_set)
            database.add_change_set(change_set)
            infos = store.get_commit_infos()
            assert len(infos) == 2, infos
            result = global_directory["foo"]
            assert result == "bar"

            global_directory["cheese"] = 99
            result = global_directory["cheese"]
            assert result == 99

            global_directory.set(99, None, comment="whatever")
            result = global_directory[99]
            assert result is None

            global_directory["foo"] = {"test": "document"}
            result = global_directory["foo"]
            assert repr(result) == "{'test': 'document'}"

def test_delete():
    """ tests that delete works as expected """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi["foo"] = "bar"
            assert gdi.has("foo") and gdi["foo"] == "bar"
            a_time = database.how_soon_is_now()
            del gdi["foo"]
            assert not gdi.has("foo"), store
            assert gdi.get("foo", as_of=a_time) == "bar"

def test_setdefault():
    """ tests that delete works as expected """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi.setdefault("foo", "bar")
            assert gdi["foo"] == "bar"
            result = gdi.setdefault("foo", "baz")
            assert result == "bar"
            assert gdi["foo"] == "bar"
            del gdi["foo"]
            gdi.setdefault("foo", "zoo", respect_deletion=True)
            assert "foo" not in gdi
            result = gdi.setdefault("foo", "moo")
            assert result == "moo"
            assert "foo" in gdi
            assert gdi["foo"] == "moo"

def test_pop():
    """ tests the pop method """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi["foo"] = "bar"
            val = gdi.pop("foo", default=3)
            assert val == "bar", val
            assert "foo" not in gdi
            val = gdi.pop("foo", default=7)
            assert val == 7

def test_items_and_keys():
    """ tests the items and keys """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True), MemoryStore(),]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi["foo"] = "bar"
            gdi["bar"] = "zoo"
            gdi["zoo"] = 3
            a_time = database.how_soon_is_now()
            gdi["foo"] = "baz"
            del gdi["bar"]
            sorted_items = sorted(gdi.items())
            assert sorted_items == [('foo', 'baz'), ('zoo', 3.0)], sorted_items
            sorted_items = sorted(gdi.items(as_of=a_time))
            assert sorted_items == [('bar', 'zoo'), ('foo', 'bar'), ('zoo', 3.0)]
            keys = gdi.keys()
            assert keys == set(["foo", "zoo"]), keys
            gdi[3] = True
            keys = gdi.keys()
            assert keys == set(["foo", "zoo", 3]), keys

def test_popitem_and_len():
    """ ensures popitem works as intended """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True), MemoryStore(),]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi["foo"] = "bar"
            gdi["bar"] = "zoo"
            assert len(gdi) == 2
            key1, val1 = gdi.popitem()
            assert key1 in ("foo", "bar")
            assert val1 == "bar" if key1 == "foo" else val1 == "zoo"
            assert len(gdi) == 1
            key2, val2 = gdi.popitem()
            assert key2 != key1
            assert key2 in ("foo", "bar")
            assert val2 == "bar" if key2 == "foo" else val2 == "zoo"
            assert len(gdi) == 0

def test_update():
    """ tests both forms of the update method """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True), MemoryStore(),]:
        with store:
            database = Database(store=store)
            gdi = Directory.global_instance(database=database)
            gdi.update({"foo": "bar", 99: 100})
            gdi.update([("zoo", "bear"), (99, 101)])
            as_dict = dict(gdi.items())
            assert as_dict == {"foo": "bar", "zoo": "bear", 99: 101}, as_dict

