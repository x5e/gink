from ..impl.utilities import decodeFromHex, encodeToHex

def test_encode_decode_hex():
    """ Tests authentication tokens and hex encoding and decoding """
    token = "Token 0=9v8inrhngv0v1ven-koad"
    asHex = encodeToHex(token)
    fromHex = decodeFromHex(asHex)
    assert token == fromHex
