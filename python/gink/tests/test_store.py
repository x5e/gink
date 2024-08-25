""" Various tests of Store objects that can be run against any implementation. """

# batteries included python modules
from typing import Callable, Optional
from contextlib import closing
from nacl.signing import SigningKey, VerifyKey
from nacl.utils import random
from nacl.secret import SecretBox


# gink generated proto modules
from ..impl.builders import BundleBuilder
from google.protobuf.text_format import Parse  # type: ignore

# gink stuff
from ..impl.abstract_store import AbstractStore
from ..impl.bundle_info import BundleInfo
from ..impl.bundle_wrapper import BundleWrapper
from ..impl.muid import Muid
from ..impl.tuples import Chain
from ..impl.utilities import digest
from ..impl.database import Database
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.utilities import generate_timestamp

StoreMaker = Callable[[], AbstractStore]

signing_key = SigningKey.generate()
verify_key: VerifyKey = signing_key.verify_key


def curried(a_function, some_data) -> Callable[[], None]:
    """ returns a function with the first argument applied to the second """

    def wrapped():
        a_function(some_data)

    return wrapped


def install_tests(into_where, from_place, store_maker):
    """ Installs the generic tests as applied to a specific store. """
    if hasattr(from_place, "keys"):
        keys = list(from_place.keys())
        get = lambda key: from_place[key]
    else:
        keys = dir(from_place)
        get = lambda key: getattr(from_place, key)
    for name in keys:
        if name.startswith("generic_test"):
            new_name = name.replace("generic_", "")
            new_func = curried(get(name), store_maker)
            new_func.__name__ = new_name
            into_where[new_name] = new_func


def make_empty_bundle(bundle_info: BundleInfo, prior: Optional[bytes] = None) -> bytes:
    """ Makes an empty change set that matches the given metadata. """
    builder = BundleBuilder()
    builder.medallion = bundle_info.medallion  # type: ignore
    builder.chain_start = bundle_info.chain_start  # type: ignore
    builder.timestamp = bundle_info.timestamp  # type: ignore
    builder.previous = bundle_info.previous  # type: ignore
    if bundle_info.comment:
        builder.comment = bundle_info.comment  # type: ignore
    if bundle_info.timestamp == bundle_info.chain_start:
        builder.verify_key = bytes(verify_key)
    if prior:
        builder.prior_hash = digest(prior)
    return signing_key.sign(builder.SerializeToString())  # type: ignore


def generic_test_accepts_only_once(store_maker: StoreMaker):
    """ Ensures that the store accepts things as expected. """
    # with closing(store_maker()) as store:
    store = store_maker()
    try:
        start_info = BundleInfo(medallion=123, chain_start=456, timestamp=456, comment="start")
        start_bytes = make_empty_bundle(start_info)

        result_starting_first = store.apply_bundle(start_bytes)
        assert result_starting_first

        result_starting_repeat = store.apply_bundle(start_bytes)
        assert not result_starting_repeat

        ext_info = BundleInfo(medallion=123, chain_start=456, timestamp=555,
                              comment="extension", previous=456)
        ext_bytes = make_empty_bundle(ext_info, start_bytes)

        result_ext_first = store.apply_bundle(ext_bytes)
        assert result_ext_first

        result_ext_second = store.apply_bundle(ext_bytes)
        assert not result_ext_second
    finally:
        store.close()


def generic_limit_to(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        a1 = make_empty_bundle(BundleInfo(medallion=123, chain_start=456, timestamp=456, comment="a1"))
        store.apply_bundle(a1)
        a2 = make_empty_bundle(
            BundleInfo(medallion=123, chain_start=456, timestamp=456, previous=456, comment="a2"),
            a1)
        store.apply_bundle(a2)

        b1 = make_empty_bundle(BundleInfo(medallion=775, chain_start=456, timestamp=456, comment="b1"))
        store.apply_bundle(b1)
        b2 = make_empty_bundle(
            BundleInfo(medallion=775, chain_start=456, timestamp=456, previous=456, comment="b2"), b1)
        store.apply_bundle(b2)

        c1 = make_empty_bundle(BundleInfo(medallion=137, chain_start=456, timestamp=456, comment="c1"))
        store.apply_bundle(c1)
        c2 = make_empty_bundle(
            BundleInfo(medallion=137, chain_start=456, timestamp=456, previous=456, comment="c2"), c1)
        store.apply_bundle(c2)

        limit_to = {
            Chain(123, 456): float("inf"),
            Chain(775, 456): 456,
        }

        infos = store.get_bundle_infos(limit_to=limit_to)
        assert len(infos) == 3
        comments = [info.comment for info in infos]
        assert comments == ["a1", "b1", "a2"], comments


def generic_test_rejects_gap(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        start_info = BundleInfo(medallion=123, chain_start=456, timestamp=456, comment="start")
        start_bytes = make_empty_bundle(start_info)
        store.apply_bundle(start_bytes)

        gap_info = BundleInfo(medallion=123, chain_start=456, timestamp=789,
                              previous=777, comment="gap")
        gap_bytes = make_empty_bundle(gap_info)
        thrown = None
        try:
            store.apply_bundle(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown


def generic_test_rejects_missing_start(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        gap_info = BundleInfo(medallion=123, chain_start=456, timestamp=789,
                              previous=777, comment="gap")
        gap_bytes = make_empty_bundle(gap_info)
        thrown = None
        try:
            store.apply_bundle(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown


def generic_test_rejects_bad_bundle(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        gap_info = BundleInfo(medallion=123, chain_start=456, timestamp=789, comment="bad")
        gap_bytes = make_empty_bundle(gap_info)
        thrown = None
        try:
            store.apply_bundle(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown


def generic_test_orders_bundles(store_maker: StoreMaker):
    """ Ensures that the store orders change sets correctly. """
    info1 = BundleInfo(medallion=123, chain_start=456, timestamp=456)
    cs1 = make_empty_bundle(info1)

    info2 = BundleInfo(medallion=123, chain_start=456, timestamp=777, previous=456)
    cs2 = make_empty_bundle(info2, cs1)

    info3 = BundleInfo(medallion=789, chain_start=555, timestamp=555)
    cs3 = make_empty_bundle(info3)

    info4 = BundleInfo(medallion=789, chain_start=555, timestamp=999, previous=555)
    cs4 = make_empty_bundle(info4, cs3)

    with closing(store_maker()) as store:
        store.apply_bundle(cs1)
        store.apply_bundle(cs2)
        store.apply_bundle(cs3)
        store.apply_bundle(cs4)

        ordered = []

        def appender(wrapper: BundleWrapper):
            ordered.append((wrapper.get_bytes(), wrapper.get_info()))

        store.get_bundles(appender)
        assert len(ordered) == 4
        assert ordered[0] == (cs1, info1)
        assert ordered[1] == (cs3, info3) or ordered[1] == (cs2, info2)
        assert ordered[2] == (cs2, info2) or ordered[2] == (cs3, info3)
        assert ordered[3] == (cs4, info4)

def generic_test_symmetric_keys(store_maker: StoreMaker):
    with closing(store_maker()) as store:
        key1 = random(32)
        key2 = random(32)
        assert key1 != key2
        id1 = store.save_symmetric_key(key1)
        id2 = store.save_symmetric_key(key2)
        result1 = store.get_symmetric_key(id1)
        assert result1 == key1
        result2 = store.get_symmetric_key(id2)
        assert result2 == key2

def generic_test_tracks(store_maker: StoreMaker):
    """ Ensures that the store orders change sets correctly. """
    info1 = BundleInfo(medallion=123, chain_start=456, timestamp=456)
    cs1 = make_empty_bundle(info1)

    info2 = BundleInfo(medallion=123, chain_start=456, timestamp=777, previous=456)
    cs2 = make_empty_bundle(info2, cs1)

    info3 = BundleInfo(medallion=789, chain_start=555, timestamp=555)
    cs3 = make_empty_bundle(info3)

    info4 = BundleInfo(medallion=789, chain_start=555, timestamp=999, previous=555)
    cs4 = make_empty_bundle(info4, cs3)

    info5 = BundleInfo(medallion=789, chain_start=555, timestamp=1000, previous=999)
    with closing(store_maker()) as store:
        store.apply_bundle(cs1)
        store.apply_bundle(cs2)
        store.apply_bundle(cs3)
        store.apply_bundle(cs4)
        tracker = store.get_chain_tracker()
        assert tracker.has(info1)
        assert tracker.has(info2)
        assert tracker.has(info3)
        assert tracker.has(info4)
        assert not tracker.has(info5)


def generic_test_get_ordered_entries(store_maker: StoreMaker):
    """ makes sure that the get_ordered_entries works """
    textproto1 = """
        medallion: 789
        chain_start: 122
        previous: 122
        timestamp: 123

        changes {
            container {
                behavior: SEQUENCE
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: 1 }
                pointee { offset: 1 }
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: 1 }
                value { characters: "Hello, World!" }
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: 1 }
                value { characters: "Goodbye, World!" }
            }
        }
    """
    textproto2 = """
        medallion: 789
        chain_start: 122
        timestamp: 234
        previous: 123

        changes {
            movement {
                container { timestamp: 123 offset: 1 }
                entry { timestamp: 123 offset: 2 }
            }

        }
        changes {
            movement {
                container { timestamp: 123 offset: 1 }
                entry { timestamp: 123 offset: 4 }
                dest: 120
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { timestamp: -1 offset: 8 }
                value { characters: "Whatever" }
            }
        }
    """
    with closing(store_maker()) as store:
        first = make_empty_bundle(BundleInfo(medallion=789, chain_start=122, timestamp=122))
        store.apply_bundle(first)
        bundle_builder = BundleBuilder()
        Parse(textproto1, bundle_builder)  # type: ignore
        bundle_builder.prior_hash = digest(first)
        serialized = bundle_builder.SerializeToString()  # type: ignore
        second = signing_key.sign(serialized)
        store.apply_bundle(second)
        sequence = Muid(123, 789, 1)
        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=124)]
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        gotten = store.get_positioned_entry(Muid(123, 789, 4), as_of=124)
        if gotten is None:
            raise AssertionError("expected something to be there")
        assert gotten is not None, store
        assert gotten.entry_muid == Muid(123, 789, 4)
        assert gotten.builder.value.characters == "Goodbye, World!"  # type: ignore

        bundle_builder2 = BundleBuilder()
        Parse(textproto2, bundle_builder2)  # type: ignore
        bundle_builder2.prior_hash = digest(second)
        serialized2 = bundle_builder2.SerializeToString()  # type: ignore
        store.apply_bundle(signing_key.sign(serialized2))
        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=124)]
        assert len(found) == 3
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=235)]
        assert len(found) == 2
        assert found[0].entry_muid == Muid(123, 789, 4)
        assert found[1].entry_muid == Muid(123, 789, 3), found

        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=124, desc=True)]
        assert len(found) == 3
        assert found[2].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[0].entry_muid == Muid(123, 789, 4)

        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=235, desc=True)]
        assert len(found) == 2
        assert found[0].entry_muid == Muid(123, 789, 3)
        assert found[1].entry_muid == Muid(123, 789, 4)

def generic_test_drop_history(store_maker: StoreMaker):
    with closing(store_maker()) as store:
        database = Database(store=store)
        gdi = Directory.get_global_instance(database=database)
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

def generic_test_negative_offsets(store_maker: StoreMaker):
    """ makes sure that the get_ordered_entries works """
    textproto1 = """
        medallion: 789
        chain_start: 122
        timestamp: 123
        previous: 122

        changes {
            container {
                behavior: SEQUENCE
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: -1 }
                pointee {
                    timestamp: -1
                    medallion: -1
                    offset: 1 }
            }
        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: -2 }
                value { characters: "Hello, World!" }
            }

        }
        changes {
            entry {
                behavior: SEQUENCE
                container { offset: -3 }
                value { integer: "32" }
            }
        }
    """
    with closing(store_maker()) as store:
        first = make_empty_bundle(BundleInfo(medallion=789, chain_start=122, timestamp=122))
        store.apply_bundle(first)
        bundle_builder = BundleBuilder()
        Parse(textproto1, bundle_builder)  # type: ignore
        bundle_builder.prior_hash = digest(first)
        serialized = bundle_builder.SerializeToString()  # type: ignore
        store.apply_bundle(signing_key.sign(serialized))
        sequence = Muid(123, 789, 1)
        found = [_ for _ in store.get_ordered_entries(container=sequence, as_of=124)]
        assert len(found) == 3, found
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)


def generic_test_encryption(store_maker: StoreMaker):
    """ makes sure that the get_ordered_entries works """

    outside_textproto = """
        medallion: 789
        chain_start: 122
        timestamp: 123
        previous: 122
    """

    inside_textproto = """
        changes {
            entry {
                behavior: BOX
                container { timestamp: -1, medallion: -1, offset: 1 }
                value {
                    characters: "top secret"
                }
            }
        }
    """

    with closing(store_maker()) as store:
        symmetric_key = random(32)
        secret_box = SecretBox(symmetric_key)
        key_id = store.save_symmetric_key(symmetric_key)
        first = make_empty_bundle(BundleInfo(medallion=789, chain_start=122, timestamp=122))
        store.apply_bundle(first)
        bundle_builder = BundleBuilder()
        Parse(inside_textproto, bundle_builder)  # type: ignore
        inside_serialized = bundle_builder.SerializeToString()
        bundle_builder.Clear()
        Parse(outside_textproto, bundle_builder) # type: ignore
        bundle_builder.key_id = key_id
        bundle_builder.encrypted = secret_box.encrypt(inside_serialized)
        bundle_builder.prior_hash = digest(first)
        outside_serialized = bundle_builder.SerializeToString()  # type: ignore
        store.apply_bundle(signing_key.sign(outside_serialized))
        global_box_id = Muid(-1, -1, 1)
        result = store.get_entry_by_key(global_box_id, None, -1)
        assert result is not None
        secret = result.builder.value.characters
        assert secret == "top secret"
