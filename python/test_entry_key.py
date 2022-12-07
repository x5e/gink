""" tests of the EntryKey class """
from _entry_key import EntryKey
from muid import Muid
from typedefs import MuTimestamp

def test_entry_key_sorting():
    """ ensures that entry keys sort as expected """
    global_directory = Muid(-1, -1, 7)

    key1 = EntryKey(global_directory, "foo", Muid(1,2,3), None)
    key2 = EntryKey(global_directory, "foo", Muid(7,8,9), None)
    key3 = EntryKey(global_directory, 77, Muid(1,2,3), None)
    in_list = [key1, key2, key3]
    in_list.sort()
    assert in_list[0] == key3, in_list[0] # numbers come first
    assert in_list[1] == key2, in_list[1] # higher entries come first
    assert in_list[2] == key1

def test_entry_to_from_bytes():
    """ ensures that serialization works as expected """
    global_directory = Muid(-1, -1, 7)

    key1 = EntryKey(global_directory, "foo", Muid(1,2,3), MuTimestamp(99))
    encoded = bytes(key1)
    key2 = EntryKey.from_bytes(encoded)
    assert key1 == key2, key2
