from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.abstract_store import AbstractStore
from ..impl.database import Database


def test_contained():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore()]:
        with store:
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            root = Directory.get_global_instance(database=database)
            root["first"] = Directory()
            root["second"] = Sequence()
            assert isinstance(root["first"], Directory)
            assert isinstance(root["second"], Sequence)
