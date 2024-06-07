from ..impl.utilities import decode_from_hex, encode_to_hex, experimental

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
