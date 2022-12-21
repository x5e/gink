""" Various tests of Store objects that can be run against any implementation. """

# batteries included python modules
from typing import Callable
from contextlib import closing

# things installed via pip
from google.protobuf.text_format import Parse

# gink generated proto modules
from change_set_pb2 import ChangeSet as ChangeSetBuilder

# gink stuff
from abstract_store import AbstractStore
from change_set_info import ChangeSetInfo

StoreMaker = Callable[[], AbstractStore]

def curried(a_function, some_data) -> Callable[[], None]:
    """ returns a function with the first argument applied to the second """
    def wrapped():
        a_function(some_data)
    return wrapped

def install_tests(into_where, from_module, store_maker):
    """ Installs the generic tests as applied to a specific store. """
    for name in dir(from_module):
        if name.startswith("generic_test"):
            new_name = name.replace("generic_", "")
            new_func = from_module.curried(getattr(from_module, name), store_maker)
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

