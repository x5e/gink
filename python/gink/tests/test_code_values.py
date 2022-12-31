""" tests the conversion functions in code_values
"""
from ..impl.coding import encode_value, decode_value, EntryStorageKey, QueueMiddleKey, SEQUENCE, DIRECTORY
from ..impl.muid import Muid



def test_encode_decode():
    """ Tests a bunch of basic values. """
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

    key1 = EntryStorageKey(global_directory, "foo", Muid(1,2,3), None)
    key2 = EntryStorageKey(global_directory, "foo", Muid(7,8,9), None)
    key3 = EntryStorageKey(global_directory, 77, Muid(1,2,3), None)
    in_list = [key1, key2, key3]
    in_list.sort()
    assert in_list[0] == key3, in_list[0] # numbers come first
    assert in_list[1] == key1, in_list[1]
    assert in_list[2] == key2

def test_entry_to_from_bytes():
    """ ensures that serialization works as expected """
    global_directory = Muid(-1, -1, 7)

    key1 = EntryStorageKey(global_directory, "foo", Muid(1,2,3), 99)
    encoded = bytes(key1)
    key2 = EntryStorageKey.from_bytes(encoded, DIRECTORY)
    assert key1 == key2, key2

    key3 = EntryStorageKey(Muid(123, 77, 1), QueueMiddleKey(235, Muid(234, 77, 3)), Muid(234, 77, 2), None)
    encoded = bytes(key3)
    key4 = EntryStorageKey.from_bytes(encoded, SEQUENCE)
    assert key4 == key3, key4
