from ..impl.utilities import decode_from_hex, encode_to_hex, experimental, is_named_tuple, is_type
from ..impl.tuples import Chain, Muid
from ..impl.typedefs import UserKey

def test_encode_decode_hex():
    """ Tests authentication tokens and hex encoding and decoding """
    token = "Token 0=9v8inrhngv0v1ven-koad"
    asHex = encode_to_hex(token)
    fromHex = decode_from_hex(asHex)
    assert token == fromHex

def test_experimental():

    @experimental
    def foo(a):
        return a+1

    bar = foo(3)
    baz = foo(4)

    assert bar == 4 and baz == 5

def test_is_named_tuple():
    chain = Chain(1, 2)
    muid = Muid(1, 2, 3)
    assert is_named_tuple(chain)
    assert is_named_tuple(muid)
    assert not is_named_tuple((1, 2, 3))

def test_is_type():
    assert is_type(1, UserKey)
    assert is_type("hello", UserKey)
    assert not is_type((1, 2), UserKey)
    assert not is_type(1, (str, tuple))
    assert is_type((1, 2), (str, tuple))
    assert is_type(Muid(1, 1, 1), Muid)
