#!/usr/bin/env python3
""" test the sequence class """
from contextlib import closing
from time import sleep

from ..impl.muid import Muid
from ..impl.sequence import Sequence
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.patch import PATCHED

assert PATCHED

def test_creation():
    """ test that I can create new sequences as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with closing(store):
            database = Database(store=store)
            sequence1 = Sequence(muid=Muid(1,2,3), database=database)
            assert len(store.get_bundle_infos()) == 0

            sequence2 = Sequence()
            assert len(store.get_bundle_infos()) != 0
            assert sequence1 != sequence2

def test_repr():
    """ test that I can create sequences and represent them """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with closing(store):
            database = Database(store=store)
            sequence = Sequence.global_instance(database)
            sequence.append("Hello, World!")
            assert list(sequence) == ["Hello, World!"]           
            assert repr(sequence) == "Sequence(muid=Muid(-1, -1, 8))"
            sequence = Sequence(muid=Muid(1,2,3))
            assert repr(sequence) == "Sequence(muid=Muid(1, 2, 3))"


def test_basics():
    """ test that I can append and look at contents """
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.global_instance(database), Sequence(muid=Muid(1,2,3))]:
                assert list(seq) == []
                seq.append("Hello, World!")
                assert list(seq) == ["Hello, World!"]
                seq.append(42)
                assert list(seq) == ["Hello, World!", 42]
                seq.append({"foo": []})
                assert list(seq) == ["Hello, World!", 42, {"foo": ()}]
                popped = seq.pop(1)
                assert popped == 42, popped
                seq.append(True)
                seq.append(False)
                found = seq.index(True)
                assert found == 2, found
                seq.remove("Hello, World!")
                found = seq.index(True)
                assert found == 1
                assert seq[2] == False, seq[2]
                assert len(seq) == 3
                assert 7 not in seq
                seq.append(7)


def test_reordering():
    """ makes sure that I can move things around """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.global_instance(database), Sequence(muid=Muid(1,2,3))]:
                for letter in "abcxyz":
                    sleep(.001)
                    seq.append(letter)
                assert list(seq) == ["a", "b", "c", "x", "y", "z"], list(seq)
                seq.pop(dest=1)
                assert list(seq) == ["a", "z", "b", "c", "x", "y"]
                seq.pop(2, dest=-2)
                assert list(seq) == ["a", "z", "c", "x", "b", "y"]
                seq.pop(0, dest=3)
                assert list(seq) == ["z", "c", "a", "x", "b", "y"]
                seq.remove("x")
                assert list(seq) == ["z", "c", "a", "b", "y"]
                seq.remove("c", dest=seq.index("y"))
                assert list(seq) == ["z", "a", "b", "c", "y"]
                seq.pop(1, dest=-1)
                assert list(seq) == ["z", "b", "c", "y", "a"], list(seq)
                previously = list(seq.values(as_of=-1))
                assert previously == ["z", "a", "b", "c", "y"], (store, previously)

def test_as_of():
    """ make sure that historical queries work as expected """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.global_instance(database)]:
                seq.append("foo")
                sleep(.001)
                seq.append("bar")
                assert list(seq.values()) == ["foo", "bar"], list(seq.values())
                seq.pop(dest=0)
                assert list(seq.values()) == ["bar", "foo"], list(seq.values())
                previous = list(seq.values(as_of=-1))
                if previous != ["foo", "bar"]:
                    raise AssertionError(str(previous))
                seq.append("zoo")
                assert list(seq.values()) == ["bar", "foo", "zoo"]
                assert list(seq.values(as_of=-1)) == ["bar", "foo"]
                assert list(seq.values(as_of=-2)) == ["foo", "bar"]
                seq.remove("foo", dest=-1)
                assert list(seq.values()) == ["bar", "zoo", "foo"]
                seq.remove("foo")
                assert list(seq.values()) == ["bar", "zoo"]
                # as_of=1 will show things right *after* the second commit
                # the first commit starts the chain, the second one adds "foo"
                assert list(seq.values(as_of=1)) == ["foo"], list(seq.values(as_of=1))

def test_insert():
    """ makes sure that I insert data at arbitrary location in a sequence """
    for store in [LmdbStore("/tmp/gink.mdb", reset=True)]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.global_instance(database), Sequence(muid=Muid(1,2,3))]:
                for letter in "abc":
                    seq.append(letter, comment=letter)
                    sleep(.001)
                assert list(seq) == ["a", "b", "c"], list(seq)
                seq.insert(1, "x", comment="x")
                if list(seq) != ["a", "x", "b", "c"]:
                    raise AssertionError(list(seq))
                seq.insert(0, "y", comment="y")
                if list(seq) != ["y", "a", "x", "b", "c"]:
                    raise AssertionError(list(seq))
