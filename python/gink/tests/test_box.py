#!.usr/bin/env python3
""" test the box class """
from contextlib import closing
import time

from ..impl.muid import Muid
from ..impl.box import Box
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore
from ..impl.utilities import generate_timestamp

def test_creation():
    """ test that I can create new boxes as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            box1 = Box(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            box2 = Box()
            assert len(store.get_bundle_infos()) != 0
            assert box1 != box2

def test_set_get():
    """ Test the basic set/get functionality of boxes works as expected. """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            global_box = Box.get_global_instance(database=database)

            bundler = Bundler("testing")
            global_box.set("test value", bundler=bundler)
            database.bundle(bundler)
            infos = store.get_bundle_infos()
            assert len(infos) == 2, infos

            result = global_box.get()
            assert result == "test value"

            global_box.set(99)
            result = global_box.get()
            assert result == 99

            global_box.set(None)
            result = global_box.get()
            assert result is None

            global_box.set({"test": "document"})
            result = global_box.get()
            assert result == {'test': 'document'}

            global_box.set([1, 'test', 99.9])
            result = global_box.get()
            assert result == (1, 'test', 99.9)

def test_reset():
    """ tests the box gets correctly reset """
    store = LmdbStore()
    with closing(store):
        assert isinstance(store, AbstractStore)
        database = Database(store=store)
        global_box = Box.get_global_instance(database=database)

        global_box.set("first value")
        global_box.set("second value")
        after_second = generate_timestamp()

        global_box.set("third value")
        after_third = generate_timestamp()

        global_box.set("fourth value")

        global_box.reset(after_second)
        assert global_box.get() == "second value"

        global_box.reset(after_third)
        assert global_box.get() == "third value"


def test_dumps():
    """ tests dumps method of Box class """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            global_box = Box.get_global_instance(database=database)

            global_box.set("test value")
            result = global_box.dumps()

            if global_box._muid.medallion != -1 and global_box._muid.timestamp != -1:
                identifier = repr(str(global_box._muid))
            else:
                identifier = "arche=True"

            assert result == f"""{global_box.__class__.__name__}({identifier}, contents='test value')"""



def test_size():
    """ tests size method of Box class, returns either 1 or 0 """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            global_box = Box.get_global_instance(database=database)

            result = global_box.size()
            assert result == 0

            global_box.set("test value")
            result = global_box.size()
            assert result == 1

def test_isEmpty():
    """ tests isEmpty method of Box class, returns True or False """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            global_box = Box.get_global_instance(database=database)

            result = global_box.is_empty()
            assert result == True

            global_box.set("test value")
            result = global_box.is_empty()
            assert result == False

def test_as_of():
    """ make sure that historical queries work as intended """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            box1 = Box.get_global_instance(database)

            box1.set("first")
            time.sleep(.001)
            assert box1.get() == "first"

            box1.set("second")
            if box1.get(as_of=-1) == box1.get():
                raise AssertionError(str(box1.get(as_of=-1)))

            box1.set("third")
            assert box1.get(as_of=-2) == "first"
            assert box1.get(as_of=-1) == "second"
            assert box1.get() == "third"
