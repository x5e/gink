""" Various tests of Store objects that can be run against any implementation. """

# batteries included python modules
from typing import Callable
from contextlib import closing

# things installed via pip
from google.protobuf.text_format import Parse

# gink generated proto modules
from change_set_pb2 import ChangeSet as ChangeSetBuilder

# gink stuff
from ..impl.abstract_store import AbstractStore
from ..impl.change_set_info import ChangeSetInfo
from ..impl.muid import Muid

StoreMaker = Callable[[], AbstractStore]

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


def make_empty_change_set(change_set_info: ChangeSetInfo) -> bytes:
    """ Makes an empty change set that matches the given metadata. """
    builder = ChangeSetBuilder()
    builder.medallion = change_set_info.medallion  # type: ignore
    builder.chain_start = change_set_info.chain_start  # type: ignore
    builder.timestamp = change_set_info.timestamp  # type: ignore
    builder.previous_timestamp = change_set_info.prior_time  # type: ignore
    if change_set_info.comment:
        builder.comment = change_set_info.comment  # type: ignore
    return builder.SerializeToString()  # type: ignore


def generic_test_accepts_only_once(store_maker: StoreMaker):
    """ Ensures that the store accepts things as expected. """
    #with closing(store_maker()) as store:
    store = store_maker()
    try:
        start_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456, comment="start")
        start_bytes = make_empty_change_set(start_info)

        result_starting_first = store.add_commit(start_bytes)
        assert result_starting_first[0] == start_info
        assert result_starting_first[1]

        result_starting_repeat = store.add_commit(start_bytes)
        assert result_starting_repeat[0] == start_info
        assert not result_starting_repeat[1]

        ext_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=555,
            comment="extension", prior_time=456)
        ext_bytes = make_empty_change_set(ext_info)

        result_ext_first = store.add_commit(ext_bytes)
        assert result_ext_first[0] == ext_info
        assert result_ext_first[1]

        result_ext_second = store.add_commit(ext_bytes)
        assert result_ext_second[0] == ext_info
        assert not result_ext_second[1]
    finally:
        store.close()


def generic_test_rejects_gap(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        start_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456, comment="start")
        start_bytes = make_empty_change_set(start_info)
        store.add_commit(start_bytes)

        gap_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=789,
            prior_time=777, comment="gap")
        gap_bytes = make_empty_change_set(gap_info)
        thrown = None
        try:
            store.add_commit(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown

def generic_test_rejects_missing_start(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        gap_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=789, 
            prior_time=777, comment="gap")
        gap_bytes = make_empty_change_set(gap_info)
        thrown = None
        try:
            store.add_commit(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown

def generic_test_rejects_bad_commit(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    with closing(store_maker()) as store:
        gap_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=789, comment="bad")
        gap_bytes = make_empty_change_set(gap_info)
        thrown = None
        try:
            store.add_commit(gap_bytes)
        except ValueError as exception:
            thrown = exception
        assert thrown

def generic_test_orders_commits(store_maker: StoreMaker):
    """ Ensures that the store orders change sets correctly. """
    info1 = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456)
    cs1 = make_empty_change_set(info1)

    info2 = ChangeSetInfo(medallion=123, chain_start=456, timestamp=777, prior_time=456)
    cs2 = make_empty_change_set(info2)

    info3 = ChangeSetInfo(medallion=789, chain_start=555, timestamp=555)
    cs3 = make_empty_change_set(info3)

    info4 = ChangeSetInfo(medallion=789, chain_start=555, timestamp=999, prior_time=555)
    cs4 = make_empty_change_set(info4)

    with closing(store_maker()) as store:
        store.add_commit(cs1)
        store.add_commit(cs2)
        store.add_commit(cs3)
        store.add_commit(cs4)

        ordered = []
        def appender(change_set, info):
            ordered.append((change_set, info))
        store.get_commits(appender)
        assert len(ordered) == 4
        assert ordered[0] == (cs1, info1)
        assert ordered[1] == (cs3, info3)
        assert ordered[2] == (cs2, info2)
        assert ordered[3] == (cs4, info4)

def generic_test_tracks(store_maker: StoreMaker):
    """ Ensures that the store orders change sets correctly. """
    info1 = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456)
    cs1 = make_empty_change_set(info1)

    info2 = ChangeSetInfo(medallion=123, chain_start=456, timestamp=777, prior_time=456)
    cs2 = make_empty_change_set(info2)

    info3 = ChangeSetInfo(medallion=789, chain_start=555, timestamp=555)
    cs3 = make_empty_change_set(info3)

    info4 = ChangeSetInfo(medallion=789, chain_start=555, timestamp=999, prior_time=555)
    cs4 = make_empty_change_set(info4)

    info5 = ChangeSetInfo(medallion=789, chain_start=555, timestamp=1000, prior_time=999)
    with closing(store_maker()) as store:
        store.add_commit(cs1)
        store.add_commit(cs2)
        store.add_commit(cs3)
        store.add_commit(cs4)
        tracker = store.get_chain_tracker()
        assert tracker.has(info1)
        assert tracker.has(info2)
        assert tracker.has(info3)
        assert tracker.has(info4)
        assert not tracker.has(info5)


def generic_test_get_ordered_entries(store_maker: StoreMaker):
    textproto1 = """
        medallion: 789
        chain_start: 123
        timestamp: 123
        changes {
            key: 1
            value {
                container {
                    behavior: QUEUE
                }
            }
        }
        changes {
            key: 2
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    pointee { offset: 1 }
                }
            }
        }
        changes {
            key: 3
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    value { characters: "Hello, World!" }
                }
            }
        }
        changes {
            key: 4
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    value { characters: "Goodbye, World!" }
                }
            }
        }
    """
    textproto2 = """
        medallion: 789
        chain_start: 123
        timestamp: 234
        previous_timestamp: 123
        changes {
            key: 1
            value {
                exit {
                    container { timestamp: 123 offset: 1 }
                    entry { timestamp: 123 offset: 2 }
                }
            }
        }
        changes {
            key: 2
            value {
                exit {
                    container { timestamp: 123 offset: 1 }
                    entry { timestamp: 123 offset: 4 }
                    dest: 120
                }
            }
        }
        changes {
            key: 3
            value {
                entry {
                    behavior: QUEUE
                    container { timestamp: -1 offset: 8 }
                    value { characters: "Whatever" }
                }
            }
        }
    """
    with closing(store_maker()) as store:
        change_set_builder = ChangeSetBuilder()
        Parse(textproto1, change_set_builder) # type: ignore
        serialized = change_set_builder.SerializeToString() # type: ignore
        store.add_commit(serialized)
        queue = Muid(123, 789, 1)
        found = [_ for _ in store.get_ordered_entries(container=queue, as_of=124)]
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        gotten = store.get_entry(queue, Muid(123, 789, 4), as_of=124)
        assert gotten is not None
        assert gotten.address == Muid(123, 789, 4)
        assert gotten.builder.value.characters == "Goodbye, World!" # type: ignore

        change_set_builder2 = ChangeSetBuilder()
        Parse(textproto2, change_set_builder2) # type: ignore
        serialized2 = change_set_builder2.SerializeToString() # type: ignore
        store.add_commit(serialized2)
        found = [_ for _ in store.get_ordered_entries(container=queue, as_of=124)]
        assert len(found) == 3
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        found = [_ for _ in store.get_ordered_entries(container=queue, as_of=235)]
        assert len(found) == 2
        assert found[0].entry_muid == Muid(123, 789, 4)
        assert found[1].entry_muid == Muid(123, 789, 3), found

        found = [_ for _ in store.get_ordered_entries(container=queue, as_of=124, desc=True)]
        assert len(found) == 3
        assert found[2].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[0].entry_muid == Muid(123, 789, 4)

        found = [_ for _ in store.get_ordered_entries(container=queue, as_of=235, desc=True)]
        assert len(found) == 2
        assert found[0].entry_muid == Muid(123, 789, 3)
        assert found[1].entry_muid == Muid(123, 789, 4)
