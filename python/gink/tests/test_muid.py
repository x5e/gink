""" various tests of the Muid class """
from random import randint
from ..impl.muid import Muid
from ..impl.utilities import generate_medallion, generate_timestamp
from ..impl.typedefs import MIN_OFFSET, MAX_OFFSET

def random_offset():
    return randint(MIN_OFFSET, MAX_OFFSET)

def test_muid_to_str():
    """ tests that a standard muid can be converted to a string in the expected format """
    timestamp = generate_timestamp()
    medallion = generate_medallion()
    offset = random_offset()
    original = Muid(timestamp, medallion, offset)
    as_str = str(original)
    from_str = Muid.from_str(as_str)
    assert from_str == original, (original, as_str, from_str)
    assert from_str.timestamp == timestamp
    assert from_str.medallion == medallion
    assert from_str.offset == offset, (from_str.offset, offset)


def test_muid_to_repr():
    """ tests that repr(muid) works as expected """
    timestamp = generate_timestamp()
    medallion = generate_medallion()
    offset = random_offset()
    muid = Muid(timestamp, medallion, offset)
    as_repr = repr(muid)
    evald = eval(as_repr)
    assert isinstance(evald, Muid)
    assert evald.timestamp == timestamp
    assert evald.medallion == medallion
    assert evald.offset == offset


def test_to_from_bytes():
    """ test to make sure the binary serialization works as expected """
    timestamp = generate_timestamp()
    medallion = generate_medallion()
    offset = random_offset()
    original = Muid(timestamp, medallion, offset)
    as_bytes = bytes(original)
    from_bytes = Muid.from_bytes(as_bytes)
    assert from_bytes.timestamp == timestamp
    assert from_bytes.medallion == medallion
    assert from_bytes.offset == offset, (from_bytes.offset, offset)
    assert original == from_bytes
