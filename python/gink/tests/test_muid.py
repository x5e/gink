""" various tests of the Muid class """
from ..impl.muid import Muid

def test_muid_to_str():
    """ tests that a standard muid can be converted to a string in the expected format """
    muid = Muid(1642579230975519, 555027746660010, 11)
    as_str = str(muid)
    assert as_str == "05D5EAC793E61F-1F8CB77AE1EAA-0000B", as_str

def test_muid_to_repr():
    """ tests that repr(muid) works as expected """
    muid = Muid(1642579230975519, 555027746660010, 11)
    expected = "Muid(1642579230975519, 555027746660010, 11)"
    as_repr = repr(muid)
    assert as_repr == expected, as_repr

def test_to_from_bytes():
    """ test to make sure the binary serialization works as expected """
    muid = Muid(1642579230975519, 555027746660010, 11)
    as_bytes = bytes(muid)
    expected = bytes.fromhex("05D5EAC793E61F-1F8CB77AE1EAA-0000B".replace("-", ""))
    assert as_bytes == expected, as_bytes.hex()
    hydrated = Muid.from_bytes(as_bytes)
    assert hydrated == muid, (repr(muid), repr(hydrated))

def test_invert():
    """ tests to make sure invert and negative numbers works """
    muid0 = Muid(-1, -1, 7)
    as_bytes = bytes(muid0)
    expected = bytes.fromhex("FFFFFFFFFFFFFF-FFFFFFFFFFFFF-00007".replace("-",""))
    assert as_bytes == expected, muid0

    muidi = muid0.get_inverse()
    as_str = str(muidi)
    expected = '00000000000000-0000000000000-FFFF8'
    assert as_str == expected, (as_str, expected)
    assert muidi == Muid(0, 0, -8), muidi
