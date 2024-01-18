from ..impl.utilities import decodeToken, encodeToken

def test_encode_decode_token():
    """ Tests authentication tokens encoding and decoding """
    token = "0=9v8inrhngv0v1ven-koad"
    asHex = encodeToken(token)
    fromHex = decodeToken(asHex)
    assert f"token {token}" == fromHex
