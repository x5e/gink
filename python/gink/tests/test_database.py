""" some general tests of the Database class """
from typing import List
from contextlib import closing
from pathlib import Path
from platform import system
from io import StringIO

from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.bundle_info import BundleInfo
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.key_set import KeySet
from ..impl.log_backed_store import LogBackedStore
from ..impl.looping import loop
from ..impl.utilities import generate_timestamp
from ..impl.box import Box
from ..impl.pair_set import PairSet
from ..impl.pair_map import PairMap
from ..impl.property import Property
from ..impl.group import Group
# from ..impl.group import Group
from ..impl.muid import Muid # needed for the exec() call in test_dump

_ = Muid(0, 0, 0)


def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.get_most_recently_created_database()
    assert last == database


def test_add_bundle() -> None:
    """ tests that the add_bundle works """
    store = MemoryStore()
    database = Database(store=store)
    started = generate_timestamp()
    bundler = database.start_bundle("just a test")
    bundler.commit()
    bundles: List[BundleInfo] = []
    store.get_bundles(lambda _: bundles.append(_.get_info()))
    assert len(bundles) == 2
    assert bundles[-1].comment == "just a test"
    assert bundles[-1].timestamp > started


def test_negative_as_of():
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            bundler = database.start_bundle("hello world")
            assert bundler.timestamp is None
            bundler.commit()
            assert bundler.timestamp is not None
            recent = store.get_one(BundleInfo)
            assert recent.timestamp == bundler.timestamp


def test_bundle_two():
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            first = database.start_bundle("hello world")
            first.commit()
            second = database.start_bundle("goodbye, world")
            second.commit()


def test_reset_everything():
    """ makes sure the database.reset works """
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            root = Directory._get_global_instance(database=database)
            queue = Sequence._get_global_instance(database=database)
            ks = KeySet(database=database)
            globalks = KeySet._get_global_instance(database=database)
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
            after_first = generate_timestamp()
            if len(root) != 0:
                raise AssertionError(f"root: {root.dumps()}")
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

            after_second = generate_timestamp()
            misc.set("no", True)
            root.set(3, 4)
            queue.append("something else")
            ks.add("key2")
            globalks.add("globalkey2")

            assert len(root) == 2
            assert len(queue) == 2
            assert len(misc) == 2
            assert len(ks) == 2
            assert len(globalks) == 2
            database.reset(to_time=after_second)
            assert len(root) == 1
            assert len(queue) == 1
            assert len(misc) == 1
            assert len(ks) == 1
            assert len(globalks) == 1
            database.reset(to_time=after_first)
            assert len(root) == 0
            assert len(queue) == 0
            assert len(misc) == 0
            assert len(ks) == 0
            assert len(globalks) == 0

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
    for store in [
        LmdbStore(),
        MemoryStore(),
    ]:
        with closing(store):
            database = Database(store=store)
            root = Directory(arche=True, database=database)
            root["foo"] = Directory()
            root["foo"]["bar"] = 91
            seq_muid = Sequence(contents=[1, 2, "3"], database=database).get_muid()
            ks_muid = KeySet(contents=[1, 2, "3"], database=database).get_muid()
            box_muid = Box(contents="box contents", database=database).get_muid()
            ps_muid = PairSet(contents={
                "include": [(box_muid, ks_muid)], "exclude": [(seq_muid, ks_muid)]}, database=database).get_muid()
            pm_muid = PairMap(contents={
                (box_muid, ks_muid): "value", (box_muid, ps_muid): 3}, database=database).get_muid()
            prop_muid = Property(contents={root: "value"}, database=database).get_muid()
            g = Group(contents={"include": {box_muid, ps_muid}, "exclude": {pm_muid}}, database=database)
            group_dump = g.dumps()
            group_muid = g.get_muid()
            # TODO: vertex, edge_type, edge

            string_io = StringIO()
            database.dump(file=string_io)

            db2 = Database(store=store)
            dumped = string_io.getvalue()
            # Note: the directories being loaded back in are automatically using db2
            exec(dumped.replace("})\n", "})"))

            root2 = Directory(arche=True, database=db2)
            assert root2["foo"]["bar"] == 91

            seq = Sequence(muid=seq_muid, database=db2)
            assert seq.at(1)[1] == 2
            assert seq.at(2)[1] == "3"

            ks = KeySet(muid=ks_muid, database=db2)
            assert ks.contains("3")

            box = Box(muid=box_muid, database=db2)
            assert box.get() == "box contents"

            ps = PairSet(muid=ps_muid, database=db2)
            assert ps.contains((box_muid, ks_muid))
            assert not ps.contains((seq_muid, ks_muid))

            pm = PairMap(muid=pm_muid, database=db2)
            assert pm.get((box_muid, ks_muid)) == "value"
            assert pm.get((box_muid, ps_muid)) == 3, pm.get((box_muid, ps_muid))

            prop = Property(muid=prop_muid, database=db2)
            assert prop.get(root) == "value"

            group = Group(muid=group_muid, database=db2)
            assert group.contains(box_muid)
            assert group.contains(ps_muid)
            assert group.dumps() == group_dump


def generic_test_drop_history(store_maker):
    with closing(store_maker()) as store:
        database = Database(store=store)
        gdi = Directory._get_global_instance(database=database)
        seq = Sequence(database=database)
        seq.append("foo")
        gdi.set("foo", "bar")
        after_setting = generate_timestamp()
        assert seq.size() == 1
        assert gdi["foo"] == "bar"
        seq.remove("foo")
        gdi.delete("foo")
        assert seq.size() == 0
        assert "foo" not in gdi
        assert seq.size(as_of=after_setting) == 1
        assert gdi.get("foo", as_of=after_setting) == "bar"

        store.stop_history()

        assert seq.size(as_of=after_setting) == 0, seq.dumps(as_of=after_setting)
        assert gdi.get("foo", as_of=after_setting) == None, gdi.get("foo", as_of=after_setting)

        store.start_history()

        new_dir = Directory(database=database)
        seq.append("foo")
        gdi.set("foo", "bar")
        before_new = generate_timestamp()
        new_dir.set("foo", "baz")
        assert seq.size() == 1
        assert gdi["foo"] == "bar"
        assert new_dir["foo"] == "baz"
        seq.pop()
        gdi.delete("foo")

        assert new_dir.get("foo", as_of=before_new) == None

        store.drop_history(as_of=before_new)

        assert seq.size() == 0
        assert "foo" not in gdi
        assert new_dir["foo"] == "baz"
