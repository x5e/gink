""" some general tests of the Database class """
from typing import List
from contextlib import closing
from pathlib import Path
from platform import system
from io import StringIO

from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.bundler import Bundler
from ..impl.bundle_info import BundleInfo
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.key_set import KeySet
from ..impl.log_backed_store import LogBackedStore
from ..impl.looping import loop
from ..impl.utilities import generate_timestamp


def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.get_last()
    assert last == database


def test_add_bundle() -> None:
    """ tests that the add_bundle works """
    store = MemoryStore()
    database = Database(store=store)
    started = generate_timestamp()
    bundler = Bundler("just a test")
    database.bundle(bundler)
    bundles: List[BundleInfo] = []
    store.get_bundles(lambda _: bundles.append(_.get_info()))
    assert len(bundles) == 2
    assert bundles[-1].comment == "just a test"
    assert bundles[-1].timestamp > started


def test_negative_as_of():
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            bundler = Bundler("hello world")
            assert bundler._timestamp is None
            database.bundle(bundler)
            assert bundler._timestamp is not None
            recent = store.get_one(BundleInfo)
            assert recent.timestamp == bundler._timestamp


def test_bundle_two():
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            first = Bundler("hello world")
            database.bundle(first)
            second = Bundler("goodbye, world")
            database.bundle(second)


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


def test_react_to_store_changes():
    for store_class in [
        LogBackedStore,
        LmdbStore,
    ]:
        if system() != 'Linux':
            return
        path1 = Path("/tmp/test1.gink")
        path1.unlink(missing_ok=True)

        store1a = store_class(path1)
        store1b = store_class(path1)

        db1a = Database(store1a)
        db1b = Database(store1b)

        root1a = Directory(arche=True, database=db1a)
        root1b = Directory(arche=True, database=db1b)

        loop(db1b, until=.01)
        bundle_infos = list()
        db1b.add_callback(lambda bw: bundle_infos.append(bw.get_info()))
        root1a.set("foo", "bar", comment="abc")
        loop(db1b, until=.01)
        assert bundle_infos and bundle_infos[-1].comment == "abc", (bundle_infos, store_class)
        found = root1b.get("foo")
        assert found == "bar", found


def test_dump():
    """
        currently only tests that dump doesn't crash, in the future
        this should test if the data output by dump can be re-read in
        to reconsitute the database (thought might be done in an integraion test)
    """
    for store_type in [
        LmdbStore,
        MemoryStore,
    ]:
        store = store_type()
        with closing(store):
            database = Database(store=store)
            root = Directory(arche=True, database=database)
            root["foo"] = Directory()
            root["foo"]["bar"] = 91
            string_io = StringIO()
            database.dump(file=string_io)
            """
            db2 = Database(store=store_type())
            dumped = string_io.getvalue()
            print(dumped)
            eval(dumped.replace("\n", ";"))
            root2 = Directory(arche=True, database=db2)
            assert root2["foo"]["bar"] == 91
            """
