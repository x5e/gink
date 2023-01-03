""" some general tests of the Database class """
from typing import List
from contextlib import closing

from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
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
    database.finish_bundle(bundler)
    commits: List[BundleInfo] = []
    store.get_bundles(lambda _, info: commits.append(info))
    assert len(commits) == 2
    assert commits[-1].comment == "just a test"
    assert commits[-1].timestamp > started

def test_negative_as_of():
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            bundler = Bundler("hello world")
            assert bundler.timestamp is None
            database.finish_bundle(bundler)
            assert bundler.timestamp is not None
            recent = store.get_one(BundleInfo)
            assert recent.timestamp == bundler.timestamp
