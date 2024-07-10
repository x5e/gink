#!/usr/bin/env python3
""" test the directory class """
from contextlib import closing

from ..impl.muid import Muid
from ..impl.directory import Directory
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore
from ..impl.utilities import generate_timestamp

def test_creation():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            directory1 = Directory(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            directory2 = Directory()
            assert len(store.get_bundle_infos()) != 0
            assert directory1 != directory2

def test_set_get():
    """ Test the basic set/get functionality of directories works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            global_directory = Directory.get_global_instance(database=database)

            bundler = Bundler("testing")
            global_directory.set("foo", "bar", bundler=bundler)
            database.bundle(bundler)
            infos = store.get_bundle_infos()
            assert len(infos) == 2, infos
            result = global_directory["foo"]
            assert result == "bar", f"result={result}"

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
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            assert gdi.has("foo") and gdi["foo"] == "bar"
            a_time = generate_timestamp()
            del gdi["foo"]
            assert not gdi.has("foo"), store
            assert gdi.get("foo", as_of=a_time) == "bar"

def test_setdefault():
    """ tests that delete works as expected """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
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
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            val = gdi.pop("foo", 3)
            assert val == "bar", val
            assert "foo" not in gdi
            val = gdi.pop("foo", 7)
            assert val == 7

def test_items_and_keys():
    """ tests the items and keys """
    for store in [LmdbStore(), MemoryStore(), ]:
        with store:
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            gdi["bar"] = "zoo"
            gdi["zoo"] = 3
            a_time = generate_timestamp()
            gdi["foo"] = "baz"
            del gdi["bar"]
            sorted_items = sorted(gdi.items())
            assert sorted_items == [('foo', 'baz'), ('zoo', 3.0)], sorted_items
            sorted_items = sorted(gdi.items(as_of=a_time))
            assert sorted_items == [('bar', 'zoo'), ('foo', 'bar'), ('zoo', 3.0)]
            keys = set(gdi.keys())
            assert keys == set(["foo", "zoo"]), keys
            gdi[3] = True
            keys = set(gdi.keys())
            assert keys == set(["foo", "zoo", 3]), keys

def test_popitem_and_len():
    """ ensures popitem works as intended """
    for store in [MemoryStore(), LmdbStore(),  ]:
        with store:
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
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
    for store in [LmdbStore(), MemoryStore(), ]:
        with store:
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi.update({"foo": "bar", 99: 100})
            gdi.update([("zoo", "bear"), (99, 101)])
            as_dict = dict(gdi.items())
            assert as_dict == {"foo": "bar", "zoo": "bear", 99: 101}, as_dict

def test_reset():
    """ tests that the reset(time) functionality works """
    for store in [LmdbStore(), MemoryStore()]:
        # TODO: implement reset in memory store
        with store:
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            gdi["bar"] = "foo"
            gdi[7] = {"cheese": "wiz", "foo": [True, False, None]}
            gdi["nope"] = Directory()
            gdi["nope"][33] = [1, 2]  # type: ignore
            middle = generate_timestamp()
            gdi["bar"] = "moo"
            gdi["foo"] = "zoo"
            gdi[99] = 30
            gdi["nope"][44] = "foo"  # type: ignore
            gdi.reset(middle)
            assert 99 not in gdi
            assert gdi["foo"] == "bar", gdi["foo"]
            assert gdi["bar"] == "foo", gdi["bar"]
            assert 44 in gdi["nope"]  # type: ignore
            bundle = gdi.reset(middle, recursive=True)
            assert 44 not in gdi["nope"]  # type: ignore
            assert bundle is not None and len(bundle) > 0
            bundle = gdi.reset(middle, recursive=True)
            assert not bundle

def test_clearance():
    """ tests the directory.clear method works as expected """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            gdi[99] = "foo"
            assert gdi["foo"] == "bar"
            clearance_muid = gdi.clear()
            assert "foo" not in gdi
            assert 99 not in gdi
            previous = gdi.get("foo", as_of=clearance_muid.timestamp)
            assert previous == "bar", previous
            gdi["bar"] = "foo"
            keys = set(gdi.keys())
            assert keys == set(["bar"]), (keys, store)

def test_reset_over_clear():
    for store in [LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            gdi = Directory.get_global_instance(database=database)
            gdi["foo"] = "bar"
            gdi["bar"] = "baz"
            set_timestamp = generate_timestamp()
            gdi.clear()
            assert "foo" not in gdi
            assert "bar" not in gdi
            gdi.reset(set_timestamp, key="foo")
            assert "bar" not in gdi
            assert gdi.get("foo") == "bar", gdi.get("foo")
            gdi.reset(set_timestamp)
            assert gdi.get("bar") == "baz", gdi.get("bar")

def test_bytes_keys():
    """ tests that I can use bytestrings as keys for directories """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            root = Directory.get_global_instance(database=database)
            a_bytestring = b"\x00\xff\x94"
            root[a_bytestring] = 42
            keys = list(root.keys())
            assert keys == [a_bytestring], keys
            assert root[a_bytestring] == 42

def test_blame_and_log():
    """ makes sure that the directory.get_blame works """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            for directory in [Directory.get_global_instance(database=database), Directory()]:
                directory.set("foo", "bar", comment="first")
                directory.set("foo", 123, comment="second")
                attr1 = directory.blame()["foo"]
                assert attr1.abstract == "second", attr1
                attr2 = directory.blame(as_of=-1)["foo"]
                assert attr2.abstract == "first", attr2

                as_list = list(directory.log("foo"))
                assert as_list[0].abstract == "second"
                assert as_list[1].abstract == "first"

def test_float_int():
    """ makes sure that the directory.get_blame works """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            for directory in [Directory.get_global_instance(database=database), Directory()]:
                directory["foo"] = 1
                directory[0] = 1.0
                assert isinstance(directory["foo"], int)
                assert isinstance(directory[0], float)

def test_walk():
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            for directory in [Directory(arche=True, database=database), Directory()]:
                directory.set(["foo", "bar"], 32)
                result = directory["/foo/bar/".split("/")]
                assert result == 32, result
                directory.delete(["foo", "bar"])
                assert not directory.has(["foo", "bar"])
