def encodeToHex(string: str) -> str:
    """
    Takes a string and encodes it into a hex string prefixed with '0x'.
    """
    # Adding 0x so we can easily determine if a subprotocol is a hex string
    return "0x" + string.encode("utf-8").hex()

def decodeFromHex(hexStr: str) -> str:
    """
    Decodes a hex string into a string using utf-8.
    """
    hexStr = hexStr[2:] # Cut off the '0x'
    bytes_obj = bytes.fromhex(hexStr)
    string = bytes_obj.decode('utf-8')
    return string
