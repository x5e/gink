from contextlib import closing
from typing_extensions import assert_type
from .. import *

def test_generic_box():
    """ Test the basic set/get functionality of GenericBox works as expected. """
    for store in [
        LmdbStore(),
        MemoryStore(),
        ]:
        with closing(store):
            Database(store=store)
            box: Box[str] = Box()
            box.set("hello")
            there = box.get("world")
            assert_type(there, str)
            assert there == "hello"


def test_generic_directory():
    """ Test the basic set/get functionality of GenericDirectory works as expected. """
    for store in [
        LmdbStore(),
        MemoryStore(),
        ]:
        with closing(store):
            Database(store=store)
            gdi: Directory[str, int] = Directory()
            gdi["one"] = 1
            gdi["two"] = 2
            there = gdi["one"]
            assert_type(there, int)
            assert there == 1

            items = set(gdi.items())
            assert_type(items, set[tuple[str, int]])
            assert items == set([("one", 1), ("two", 2)])

            keys = set(gdi.keys())
            assert_type(keys, set[str])
            assert keys == {"one", "two"}

            values = set(gdi.values())
            assert_type(values, set[int])
            assert values == {1, 2}


def test_generic_sequence():
    """ Test the basic set/get functionality of GenericSequence works as expected. """
    for store in [
        LmdbStore(),
        MemoryStore(),
        ]:
        with closing(store):
            Database(store=store)
            gsi: Sequence[str] = Sequence()
            gsi.append("first")
            gsi.append("second")
            gsi.append("third")

            there = gsi[1]
            assert_type(there, str)
            assert there == "second"

            items = list(gsi)
            assert_type(items, list[str])
            assert items[0] == "first"
            assert items[1] == "second"
            assert items[2] == "third"

            values = list(gsi.values())
            assert_type(values, list[str])
            assert values == ["first", "second", "third"]
