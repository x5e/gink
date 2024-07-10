from time import time as get_time, sleep
from math import floor
from os import getuid, getpid
from socket import gethostname
from pwd import getpwuid
from functools import wraps
from warnings import warn
from random import randint
from datetime import datetime, date, timedelta
from re import fullmatch, IGNORECASE
from psutil import pid_exists
from requests import get
from authlib.jose import jwt, JsonWebKey
from authlib.jose.errors import JoseError
from time import time as get_time
from typing import Optional
from random import choice

from .typedefs import MuTimestamp, Medallion, GenericTimestamp
from .tuples import Chain
from .builders import ClaimBuilder
from .typedefs import AuthFunc, AUTH_FULL, AUTH_NONE

def make_auth_func(token: str) -> AuthFunc:
    def auth_func(data: str, *_) -> int:
        return AUTH_FULL if fullmatch(f"token\s+{token}\s*", data, IGNORECASE) else AUTH_NONE
    return auth_func

def encode_to_hex(string: str) -> str:
    """
    Takes a string and encodes it into a hex string prefixed with '0x'.
    """
    # Adding 0x so we can easily determine if a subprotocol is a hex string
    return "0x" + string.encode("utf-8").hex()

def decode_from_hex(hex_str: str) -> str:
    """
    Decodes a hex string into a string using utf-8.
    """
    hex_str = hex_str[2:]  # Cut off the '0x'
    bytes_obj = bytes.fromhex(hex_str)
    string = bytes_obj.decode('utf-8')
    return string

_last_time = get_time()

def generate_timestamp() -> MuTimestamp:
    """ returns the current time in microseconds since epoch

        sleeps if needed to ensure no duplicate timestamps and
        that the timestamps returned are monotonically increasing
    """
    global _last_time
    while True:
        now = floor(get_time() * 1_000_000)
        if now > _last_time:
            break
        sleep(1e-5)
    _last_time = now
    return now

def generate_medallion() -> Medallion:
    return randint((2 ** 48) + 1, (2 ** 49) - 1)

def get_identity() -> str:
    user_data = getpwuid(getuid())
    return "%s@%s" % (user_data[0], gethostname())

def experimental(thing):
    warned = [False]
    name = f"{thing.__module__}.{thing.__name__}"
    the_class = None
    if isinstance(thing, type):
        the_class = thing
        thing = the_class.__init__

    @wraps(thing)
    def wrapped(*a, **b):
        if not warned[0]:
            warn(
                f"{name} is experimental",
                DeprecationWarning, stacklevel=2,)
            warned[0] = True
        return thing(*a, **b)
    if the_class:
        the_class.__init__ = wrapped
        return the_class
    else:
        return wrapped

def is_certainly_gone(process_id: int) -> bool:
    if not pid_exists(process_id):
        return True
    return False

def create_claim(chain: Chain) -> ClaimBuilder:
    claim_builder = ClaimBuilder()
    claim_builder.claim_time = generate_timestamp()
    claim_builder.medallion = chain.medallion
    claim_builder.chain_start = chain.chain_start
    claim_builder.process_id = getpid()
    return claim_builder

def resolve_timestamp(timestamp: GenericTimestamp) -> MuTimestamp:
    if isinstance(timestamp, str):
        if fullmatch(r"-?\d+", timestamp):
            timestamp = int(timestamp)
        else:
            timestamp = datetime.fromisoformat(timestamp)
    if timestamp is not None and hasattr(timestamp, "timestamp"):
        muid_timestamp = timestamp.timestamp
        if not isinstance(muid_timestamp, MuTimestamp):
            raise ValueError("timestamp.timestamp doesn't have a resolved timestamp")
        return muid_timestamp
    if isinstance(timestamp, timedelta):
        return generate_timestamp() + int(timestamp.total_seconds() * 1e6)
    if isinstance(timestamp, date):
        timestamp = datetime(timestamp.year, timestamp.month, timestamp.day)
    if isinstance(timestamp, datetime):
        timestamp = timestamp.timestamp()
    if isinstance(timestamp, (int, float)):
        if 1671697316392367 < timestamp < 2147483648000000:
            # appears to be a microsecond timestamp
            return int(timestamp)
        if 1671697630 < timestamp < 2147483648:
            # appears to be seconds since epoch
            return int(timestamp * 1e6)
    if isinstance(timestamp, float) and 1e6 > timestamp > -1e6:
        return generate_timestamp() + int(1e6 * timestamp)
    raise ValueError(f"don't know how to resolve {timestamp} into a timestamp")

# URL to get Google's public keys
GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

_public_keys = None

def decode_and_verify_jwt(token: bytes, app_id: Optional[str] = None) -> dict:
    """ Get the useful claims from a jwt after deconstructing it. """
    global _public_keys
    if _public_keys is None:
        response = get(GOOGLE_CERTS_URL)
        response.raise_for_status()
        jwks = response.json()
        _public_keys = JsonWebKey.import_key_set(jwks)
    try:
        decoded = jwt.decode(token, _public_keys)
        decoded.validate()
    except JoseError as jose_error:
        raise ValueError(jose_error)
    if decoded.get('iss') not in ("https://accounts.google.com", "accounts.google.com"):
        raise ValueError("not the issuer I expected")
    if not decoded.get("email_verified"):
        raise ValueError("email not verified")
    if decoded.get("exp") < get_time():
        raise ValueError("jwt expired")
    if app_id is not None and decoded.get("aud") != app_id:
        raise ValueError("app id is not what I expected")
    result = {}
    for key in ["sub", "email", "name", "given_name", "family_name"]:
        result[key] = decoded[key]
    return result

def generate_random_token() -> str:
    capitals = "ABCDEFGHJKLMNPQRSTVWXYZ"
    digits = "23456789"
    choices = capitals + digits
    return "T" + "".join([choice(choices) for _ in range(39)])
