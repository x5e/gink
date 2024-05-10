""" tests the conversion functions in code_values
"""
from ..impl.builders import ChangeBuilder, EntryBuilder
from ..impl.coding import encode_value, decode_value, Placement, QueueMiddleKey, SEQUENCE, DIRECTORY, PAIR_SET, VERTEX
from ..impl.muid import Muid
from ..impl.bundler import Bundler

from ..impl.memory_store import MemoryStore
from ..impl.lmdb_store import LmdbStore
from ..impl.database import Database


def test_encode_decode():
    """ Tests a bunch of basic values. """
    # Ensure ints and big ints are treated as they should
    int_builder = encode_value(4)
    assert int_builder.integer == 4
    bigint_builder = encode_value(2_147_483_650)
    assert bigint_builder.bigint == 2_147_483_650

    for original in ("foo", 1.5, 137, True, False, None, b"abc"):
        encoded = encode_value(original)
        decoded = decode_value(encoded)
        assert decoded == original, "%r != %r" % (decoded, original)

def test_tuple():
    """ Tests that a tuple can be encoded and decoded. """
    original = ("foo", 1.5, 137, True, False, None, b"abc")
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)


def test_document():
    """ Tests that a document (dict) can be encoded and decoded. """
    keys = ("foo", 15, b"abc")
    original = {key: key for key in keys}
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)


def test_empty():
    """ Tests empty tuple / document """
    for original in (tuple(), {}):
        encoded = encode_value(original)
        decoded = decode_value(encoded)
        assert decoded == original, "%r != %r" % (decoded, original)


def test_compound():
    """ a more complex encoding/decoding test """
    original = {
        "foo": "bar",
        "cheese": (False, 77.0),
        "never": {"back": "together"},
        17: ((), {33: 3}),
    }
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)


def test_entry_key_sorting():
    """ ensures that entry keys sort as expected """
    global_directory = Muid(-1, -1, 7)

    key1 = Placement(global_directory, "foo", Muid(1, 2, 3), None)
    key2 = Placement(global_directory, "foo", Muid(7, 8, 9), None)
    key3 = Placement(global_directory, 77, Muid(1, 2, 3), None)
    in_list = [key1, key2, key3]
    in_list.sort()
    assert in_list[0] == key3, in_list[0]  # numbers come first
    assert in_list[1] == key1, in_list[1]
    assert in_list[2] == key2


def test_entry_to_from_bytes():
    """ ensures that serialization works as expected """
    global_directory = Muid(-1, -1, 7)

    key1 = Placement(global_directory, "foo", Muid(1, 2, 3), 99)
    encoded = bytes(key1)
    key2 = Placement.from_bytes(encoded, DIRECTORY)
    assert key1 == key2, key2

    key3 = Placement(Muid(123, 77, 1), QueueMiddleKey(235), Muid(234, 77, 2), None)
    encoded = bytes(key3)
    key4 = Placement.from_bytes(encoded, SEQUENCE)
    assert key4 == key3, key4

    # Testing serialization for pairs
    global_pairset = Muid(-1, -1, PAIR_SET)
    noun1 = Muid(-1, -1, VERTEX)
    noun2 = Muid(124, 54, VERTEX)
    pairkey1 = Placement(global_pairset, (noun1, noun2), Muid(412, 51, 5), None)
    encoded_pair = bytes(pairkey1)
    pairkey2 = Placement.from_bytes(encoded_pair, PAIR_SET)
    assert pairkey1 == pairkey2, pairkey2

def test_entry_to_from_builder():
    """ tests that pair entries can be properly constructed from a builder """
    for store in [LmdbStore(), MemoryStore()]:
        database = Database(store)

        bundler = Bundler()
        change_builder = ChangeBuilder()
        entry_builder = change_builder.entry
        entry_builder.behavior = PAIR_SET

        global_pairset = Muid(-1, -1, PAIR_SET)
        noun1 = Muid(-1, -1, VERTEX)
        noun2 = Muid(124, 54, VERTEX)

        global_pairset.put_into(entry_builder.container)
        noun1.put_into(entry_builder.pair.left)
        noun2.put_into(entry_builder.pair.rite)

        bundler.add_change(change_builder)
        info = database.bundle(bundler)

        # From builder
        assert Placement.from_builder(
            entry_builder, info, offset=PAIR_SET).middle == (Muid(-1, -1, 7), Muid(124, 54, 7))
