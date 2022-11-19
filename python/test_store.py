""" Various tests of Store objects that can be run against any implementation. """
from typing import Callable, Optional as O
from abstract_store import AbstractStore
from change_set_info import ChangeSetInfo
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from typedefs import MuTimestamp

StoreMaker = Callable[[], AbstractStore]

def make_empty_change_set(change_set_info: ChangeSetInfo, prior: O[MuTimestamp] = None) -> bytes:
    """ Makes an empty change set that matches the given metadata. """
    builder = ChangeSetBuilder()
    builder.medallion = change_set_info.medallion  # type: ignore
    builder.chain_start = change_set_info.chain_start  # type: ignore
    builder.timestamp = change_set_info.timestamp  # type: ignore
    if prior:
        builder.previous_timestamp = prior  # type: ignore
    if change_set_info.comment:
        builder.comment = change_set_info.comment  # type: ignore
    return builder.SerializeToString()  # type: ignore


def generic_test_accepts_only_once(store_maker: StoreMaker):
    """ Ensures that the store accepts things as expected. """
    store = store_maker()
    start_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456, comment="starting")
    start_bytes = make_empty_change_set(start_info)

    result_starting_first = store.add_commit(start_bytes)
    assert result_starting_first[0] == start_info
    assert result_starting_first[1]

    result_starting_repeat = store.add_commit(start_bytes)
    assert result_starting_repeat[0] == start_info
    assert not result_starting_repeat[1]

    ext_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=555, comment="extension")
    ext_bytes = make_empty_change_set(ext_info, prior=MuTimestamp(456))

    result_ext_first = store.add_commit(ext_bytes)
    assert result_ext_first[0] == ext_info
    assert result_ext_first[1]

    result_ext_second = store.add_commit(ext_bytes)
    assert result_ext_second[0] == ext_info
    assert not result_ext_second[1]


def generic_test_rejects_gap(store_maker: StoreMaker):
    """ Ensures that chains with missing links throw exceptions. """
    store = store_maker()
    start_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=456, comment="starting")
    start_bytes = make_empty_change_set(start_info)
    store.add_commit(start_bytes)

    gap_info = ChangeSetInfo(medallion=123, chain_start=456, timestamp=789, comment="gap")
    gap_bytes = make_empty_change_set(gap_info, prior=MuTimestamp(777))
    thrown = None
    try:
        store.add_commit(gap_bytes)
    except ValueError as exception:
        thrown = exception
    assert thrown
