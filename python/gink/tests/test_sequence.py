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
    for store in [MemoryStore(), LmdbStore("/tmp/gink.mdb", reset=True)]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.global_instance(database), Sequence(muid=Muid(1,2,3))]:
                for letter in "abcxyz":
                    sleep(.001)
                    seq.append(letter)
                assert list(seq) == ["a", "b", "c", "x", "y", "z"], list(seq)
                seq.pop(dest=seq.before(1))
                assert list(seq) == ["a", "z", "b", "c", "x", "y"]
                seq.pop(2, dest=seq.before(-1))
                assert list(seq) == ["a", "z", "c", "x", "b", "y"]
                seq.pop(0, dest=seq.after(2))
                assert list(seq) == ["z", "c", "a", "x", "b", "y"]
                seq.remove("x")
                assert list(seq) == ["z", "c", "a", "b", "y"]
                seq.remove("c", dest=seq.after(seq.index("b")))
                assert list(seq) == ["z", "a", "b", "c", "y"]
                seq.pop(1, dest=seq.after(-1))
                assert list(seq) == ["z", "b", "c", "y", "a"], list(seq)

def test_insert():
    """ makes sure that I can move things around """
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
