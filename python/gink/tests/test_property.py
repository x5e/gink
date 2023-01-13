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
from ..impl.patch import PATCHED

assert PATCHED

def test_property_set_get():
    """ Test the basic set/get functionality of properties works as expected. """
    for store in [LmdbStore(), MemoryStore(),]:
        with closing(store):
            database = Database(store=store)
            namer = Property.get_global_instance(database=database)
            directory = Directory()
            namer.set(directory, "my favorite directory")
            named = namer.get(directory)
            assert named == "my favorite directory", named

def test_property_listing():
    """ makes sure that I can get a list of all properties of an object """

def test_property_reset():
    """ ensure that I can reset all of the properties on an object to a point in the past """

def test_property_extension():
    """ tests that I can create a property that behaves as the extension of one or more others

        Only will be testing inclusions, not transforms (yet)
    """

def test_property_removal():
    """ ensures that I can remove properties on objects """
