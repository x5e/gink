def encodeToken(token: str) -> str:
    """
    Takes an authentication token and encodes it into a hex
    string so it may be passed as a subprotocol in a websocket connection.
    """
    if not token.startswith("token "):
        token = f"token {token}"

    return token.encode("utf-8").hex()

def decodeToken(hexStr: str) -> str:
    """
    Converts a hex string into a gink authentication token
    If the newly decoded token does not start with "token ",
    throws an error.
    """
    bytes_obj = bytes.fromhex(hexStr)
    token = bytes_obj.decode('utf-8')
    assert token.startswith("token "), "token does not start with 'token '"
    return token
