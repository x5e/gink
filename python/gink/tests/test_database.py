""" some general tests of the Database class """
from typing import List
from contextlib import closing

from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.bundler import Bundler
from ..impl.bundle_info import BundleInfo
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.key_set import KeySet


def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.get_last()
    assert last == database


def test_add_commit() -> None:
    """ tests that the add_commit works """
    store = MemoryStore()
    database = Database(store=store)
    started = database.get_now()
    bundler = Bundler("just a test")
    database.commit(bundler)
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
            assert bundler._timestamp is None
            database.commit(bundler)
            assert bundler._timestamp is not None
            recent = store.get_one(BundleInfo)
            assert recent.timestamp == bundler._timestamp


def test_commit_two():
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            first = Bundler("hello world")
            database.commit(first)
            second = Bundler("goodbye, world")
            database.commit(second)


def test_reset_everything():
    """ makes sure the database.reset works """
    for store in [
        LmdbStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            root = Directory.get_global_instance(database=database)
            queue = Sequence.get_global_instance(database=database)
            ks = KeySet(database=database)
            globalks = KeySet.get_global_instance(database=database)
            misc = Directory()

            misc[b"yes"] = False
            root["foo"] = "bar"
            queue.append("something")
            ks.add("key1")
            globalks.add("globalkey1")

            assert len(root) == 1
            assert len(queue) == 1
            assert len(misc) == 1
            assert len(ks) == 1
            assert len(globalks) == 1
            database.reset()
            assert len(root) == 0, root.dumps()
            assert len(queue) == 0
            assert len(misc) == 0
            assert len(ks) == 0
            assert len(globalks) == 0
            database.reset(to_time=-1)
            assert len(root) == 1
            assert len(queue) == 1
            assert len(misc) == 1
            assert len(ks) == 1
            assert len(globalks) == 1
