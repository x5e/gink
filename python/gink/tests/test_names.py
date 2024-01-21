from contextlib import closing

from ..impl.muid import Muid
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.box import Box
from ..impl.property import Property
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore


def test_set_get():
    """ Test the basic set/get functionality of directories works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            global_directory = Directory.get_global_instance(database=database)
            for directory in [global_directory, Directory()]:
                assert directory.get_name() is None
                directory.set_name("fred")
                assert directory.get_name() == "fred"

def test_get_by_name():
    for store in [LmdbStore(), ]:
        with closing(store):
            database = Database(store=store)
            d = Directory()
            d.set_name("fred")
            s = Sequence()
            s.set_name("bob")
            b = Box()
            b.set_name("bob")
            freds = database.get_by_name("fred")
            assert len(freds) == 1 and freds[0] == d
            bobs = database.get_by_name("bob")
            assert len(bobs) == 2 and b in bobs and s in bobs

def test_properties_on_containers():
    for store in [LmdbStore(), ]:
        with closing(store):
            database = Database(store=store)
            d = Directory()
            d.set_property_value_by_name("foo", 33)
            there = d.get_property_value_by_name("foo")
            assert there == 33
            foo_property = database.get_by_name("foo")[0]
            assert isinstance(foo_property, Property)
            foo_property.set_name("bar")
            after_rename = d.get_property_value_by_name("bar")
            assert after_rename == 33
            d.set_property_value_by_name("foo", 99)
            properties_names = {p.get_name() for p in d.get_describing()}
            assert properties_names == {"foo", "bar"}
            properties_values = {p.get(d) for p in d.get_describing()}
            assert properties_values == {33, 99}
