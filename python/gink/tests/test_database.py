""" some general tests of the Database class """
from typing import List
from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from ..impl.bundler import Bundler
from ..impl.bundle_info import BundleInfo

def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.last
    assert last == database

def test_add_commit():
    """ tests that the add_commit works """
    store = MemoryStore()
    database = Database(store=store)
    started = database.get_now()
    bundler = Bundler("just a test")
    database.add_bundle(bundler)
    commits: List[BundleInfo] = []
    store.get_bundles(lambda _, info: commits.append(info))
    assert len(commits) == 2
    assert commits[-1].comment == "just a test"
    assert commits[-1].timestamp > started
