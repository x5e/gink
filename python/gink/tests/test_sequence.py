#!/usr/bin/env python3
""" test the sequence class """
from contextlib import closing
import time
from datetime import timedelta

from ..impl.muid import Muid
from ..impl.sequence import Sequence
from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database
from ..impl.utilities import generate_timestamp


def test_creation():
    """ test that I can create new sequences as well as proxies for existing ones """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            sequence1 = Sequence(muid=Muid(1, 2, 3), database=database)
            assert len(store.get_bundle_infos()) == 0

            sequence2 = Sequence()
            assert len(store.get_bundle_infos()) != 0
            assert sequence1 != sequence2


def test_repr():
    """ test that I can create sequences and represent them """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            sequence = Sequence.get_global_instance(database)
            sequence.append("Hello, World!")
            assert list(sequence) == ["Hello, World!"]
            assert repr(sequence) == "Sequence(arche=True)"
            sequence = Sequence(muid=Muid(1673009484969039, 362514588210531, 1))
            assert repr(sequence) == "Sequence(muid=Muid(1673009484969039, 362514588210531, 1))"


def test_basics():
    """ test that I can append and look at contents """
    for store in [MemoryStore(), LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database), Sequence(muid=Muid(1, 2, 3))]:
                assert not list(seq)
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
                assert seq[2] is False, seq[2]
                assert len(seq) == 3
                assert 7 not in seq
                seq.append(7)


def test_reordering():
    """ makes sure that I can move things around """
    for store in [MemoryStore(), LmdbStore(), ]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database), Sequence(muid=Muid(1, 2, 3))]:
                for letter in "abcxyz":
                    seq.append(letter)
                    time.sleep(.002)
                assert list(seq) == ["a", "b", "c", "x", "y", "z"], list(seq)
                popped = seq.pop(dest=1)
                assert list(seq) == ["a", "z", "b", "c", "x", "y"], (list(seq), popped)
                popped = seq.pop(2, dest=-2)
                assert list(seq) == ["a", "z", "c", "x", "b", "y"], (list(seq), popped)
                popped = seq.pop(0, dest=3)
                assert list(seq) == ["z", "c", "a", "x", "b", "y"], (list(seq), popped)
                popped = seq.remove("x")
                assert list(seq) == ["z", "c", "a", "b", "y"], (list(seq), popped)
                seq.remove("c", dest=seq.index("y"))
                assert list(seq) == ["z", "a", "b", "c", "y"]
                popped = seq.pop(1, dest=-1)
                assert popped == "a", popped
                assert list(seq) == ["z", "b", "c", "y", "a"], list(seq)
                previously = list(seq.values(as_of=-1))
                assert previously == ["z", "a", "b", "c", "y"], (store, previously)


def test_expiry():
    """ make sure things expire """
    # TODO: tests would be more repeatable with a synthetic/injectable time source
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database)]:
                start = generate_timestamp()
                seq.append("first", expiry=0.1)
                assert list(seq) == ["first"], list(seq)
                seq.insert(0, "second", expiry=0.3)
                mark = generate_timestamp()
                seq_as_list = list(seq)
                if seq_as_list != ["second", "first"]:
                    elapsed = str(timedelta(microseconds=mark - start))
                    raise AssertionError(f"{elapsed} unexpected: {seq_as_list} in {store}")
                seq.extend(["three", "four"])
                time.sleep(.11)
                expect_two_three_four = list(seq)
                if expect_two_three_four != ["second", "three", "four"]:
                    assertion_time = generate_timestamp()
                    raise AssertionError(str(expect_two_three_four) + " " + str(assertion_time))
                found = list(seq.values(as_of=mark))
                assert found == ["second", "first"], found
                seq.remove("three", dest=0.1)
                after_hiding_three = list(seq)
                if after_hiding_three != ["second", "four"]:
                    assertion_time = generate_timestamp()
                    raise AssertionError(str(after_hiding_three) + " " + str(assertion_time))
                time.sleep(.3)
                assert list(seq) == ["four", "three"], list(seq)


def test_as_of():
    """ make sure that historical queries work as expected """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database)]:
                seq.append("foo")
                time.sleep(.001)
                bar_append_change = seq.append("bar")
                assert list(seq.values()) == ["foo", "bar"], list(seq.values())
                seq.pop(dest=0)
                assert list(seq.values()) == ["bar", "foo"], list(seq.values())
                previous = list(seq.values(as_of=-1))
                if previous != ["foo", "bar"]:
                    raise AssertionError(str(previous))
                seq.append("zoo")
                seq_as_list = list(seq.values())
                if seq_as_list != ["bar", "foo", "zoo"]:
                    assertion_time = generate_timestamp()
                    raise AssertionError(f"{seq_as_list} at {assertion_time}")
                assert list(seq.values(as_of=-1)) == ["bar", "foo"]
                assert list(seq.values(as_of=-2)) == ["foo", "bar"]
                seq.remove("foo", dest=-1)
                seq_as_list = list(seq.values())
                if seq_as_list != ["bar", "zoo", "foo", ]:
                    assertion_time = generate_timestamp()
                    raise AssertionError(f"{seq_as_list} at {assertion_time}")
                seq.remove("foo")
                xxx = list(seq.values())
                assert xxx == ["bar", "zoo"], xxx
                etc = list(seq.values(as_of=bar_append_change.timestamp))
                assert etc == ["foo"], etc


def test_insert():
    """ makes sure that I can insert data at arbitrary location in a sequence """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database), Sequence(muid=Muid(1, 2, 3))]:
                for letter in "abc":
                    seq.append(letter, comment=letter)
                    time.sleep(.001)
                assert list(seq) == ["a", "b", "c"], list(seq)
                seq.insert(1, "x", comment="x")
                if list(seq) != ["a", "x", "b", "c"]:
                    raise AssertionError(f"{list(seq)} {store}")
                seq.insert(0, "y", comment="y")
                if list(seq) != ["y", "a", "x", "b", "c"]:
                    raise AssertionError(list(seq))


def test_clear():
    """ make sure the clear operation behaves as expected """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            database = Database(store=store)
            for seq in [Sequence.get_global_instance(database), Sequence(muid=Muid(1, 2, 3))]:
                assert len(seq) == 0, store
                seq.append(3.7)
                seq.append(9)
                assert list(seq) == [3.7, 9], f"{list(seq)}, {store}"
                mark = generate_timestamp()
                seq.clear()
                assert len(seq) == 0, store
                seq.append(True)
                assert list(seq) == [True]
                seq.append(False)
                seq.remove(False, dest=mark)
                assert list(seq.values(as_of=mark)) == [3.7, 9]
                assert list(seq) == [False, True]


def test_reset():
    """ make sure that sequence.reset behaves as expected """
    for store in [LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            seq1 = Sequence.get_global_instance(database)
            seq2 = Sequence()
            seq1.append("foo")
            seq2.append("bar")
            seq1.insert(0, 7)
            seq2.append(seq1)
            mark = generate_timestamp()
            seq1.remove("foo")
            seq1.clear()
            seq2.pop(0, dest=-1)
            seq1.append("nevermind")
            seq1.append(seq2)
            seq2.pop()
            seq2.reset(to_time=mark)
            assert list(seq2) == ["bar", seq1]
            assert list(seq1) == ["nevermind", seq2]
            seq2.reset(to_time=mark, recursive=True)
            assert list(seq1) == [7, "foo"]


def test_simple_reset():
    """ make sure that sequence.reset behaves as expected """
    for store in [LmdbStore()]:
        with closing(store):
            database = Database(store=store)
            queue = Sequence.get_global_instance(database)
            change_muid = queue.append("something")
            assert database.resolve_timestamp(-1) == change_muid.timestamp
            assert queue.dumps() == "Sequence(arche=True, contents=['something'])"
            reset_bundle = queue.reset(-1)
            assert reset_bundle is not None
            assert queue.dumps() == "Sequence(arche=True, contents=[])"
