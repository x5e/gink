""" Tests the Property container class. """
from contextlib import closing

from ..impl.muid import Muid
from ..impl.directory import Directory
from ..impl.property import Property
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.abstract_store import AbstractStore
from ..impl.utilities import generate_timestamp

def test_property_set_get():
    """ Test the basic set/get functionality of properties works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            namer = Property.get_global_instance(database=database)
            directory = Directory()
            namer.set(directory, "my favorite directory")
            named = namer.get(directory)
            assert named == "my favorite directory", named


def test_property_listing():
    """ makes sure that I can get a list of all properties of an object """


def test_property_dump():
    """ ensure that I can reset all of the properties on an object to a point in the past """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            namer = Property.get_global_instance(database=database)
            directory = Directory.get_global_instance()
            namer.set(directory, "fred")
            named = namer.get(directory)
            assert named == "fred", named
            assert namer.size() == 1, store
            dumped = namer.dumps()
            assert dumped == "Property(arche=True, contents={Directory(arche=True):'fred'})", dumped
            namer.set(directory, "joe")
            assert namer.get(directory) == "joe"
            eval(dumped)
            assert namer.get(directory) == "fred"
            namer.delete(directory)
            assert namer.size() ==  0

def test_property_from_contents():
    """ Ensures that a property can process contents passed to the constructor """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            directory1 = Directory.get_global_instance()
            directory2 = Directory()

            p1 = Property(database=database, contents={directory1: 5, directory2: 2})
            p2 = Property(database=database, contents=[(directory1, 6), (directory2, "test")])
            assert(p1.get(directory1) == 5)
            assert(p1.get(directory2) == 2)
            assert(p2.get(directory1) == 6)
            assert(p2.get(directory2) == "test")


def test_property_reset():
    """ ensures that I can remove properties on objects """
    for store in [LmdbStore(),]:
        with closing(store):
            database = Database(store=store)
            namer = Property.get_global_instance(database=database)
            directory = Directory.get_global_instance()
            namer.set(directory, "fred")
            mark = generate_timestamp()
            namer.set(directory, "joe")
            namer.reset(to_time=mark)
            assert namer.get(directory) == "fred"


def test_property_ref():
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            directory = Directory.get_global_instance(database=database)
            property = Property()
            property.set(directory, directory)
            val = property.get(directory)
            assert val == directory, val
