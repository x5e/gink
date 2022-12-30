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
            namer = Property.global_instance(database=database)
            directory = Directory()
            namer.set(directory, "my favorite directory")
            named = namer.get(directory)
            assert named == "my favorite directory", named
