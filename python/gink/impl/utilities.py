from time import time as get_time, sleep
from math import floor
from os import getuid, getpid
from socket import gethostname
from pwd import getpwuid
from functools import wraps
from warnings import warn
from random import randint
from datetime import datetime, date, timedelta
from re import fullmatch, IGNORECASE, sub
from psutil import pid_exists
from requests import get
from authlib.jose import jwt, JsonWebKey, KeySet
from authlib.jose.errors import JoseError
from time import time as get_time
from typing import Optional, Tuple
from random import choice

from .typedefs import MuTimestamp, Medallion, GenericTimestamp
from .tuples import Chain
from .muid import Muid
from .builders import (
    ClaimBuilder,
    BundleBuilder,
    ChangeBuilder,
    EntryBuilder,
)
from .typedefs import AuthFunc, AUTH_FULL, AUTH_NONE
from .builders import Behavior


def make_auth_func(token: str) -> AuthFunc:
    def auth_func(data: str, *_) -> int:
        return AUTH_FULL if fullmatch(fr"token\s+{token}\s*", data, IGNORECASE) else AUTH_NONE
    return auth_func


def encode_to_hex(string: str) -> str:
    """
    Takes a string and encodes it into a hex string prefixed with '0x'.
    """
    # Adding 0x so we can easily determine if a subprotocol is a hex string
    return "0x" + string.encode("utf-8").hex()


def is_named_tuple(obj) -> bool:
    return (
        isinstance(obj, tuple) and hasattr(obj, '_asdict') and hasattr(obj, '_fields'))


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


def normalize_pair(pair: Tuple) -> Tuple[Muid, Muid]:
    assert len(pair) == 2, "pair must be a tuple of 2 elements"
    left = None
    rite = None
    # Avoiding circular imports by using hasattr here
    if hasattr(pair[0], "_add_entry"):
        left = pair[0]._muid
    elif isinstance(pair[0], Muid):
        left = pair[0]
    if hasattr(pair[1], "_add_entry"):
        rite = pair[1]._muid
    elif isinstance(pair[1], Muid):
        rite = pair[1]
    if not left or not rite:
        raise ValueError("pair tuple can only contain 2 containers or muids")
    return left, rite


# URL to get Google's public keys
GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

_public_keys: Optional[KeySet] = None


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


def dedent(val: bytes) -> bytes:
    val = sub(b" +", b" ", val)
    val = sub(rb"\r?\n", b"\r\n", val)
    val = val.lstrip()
    return val


user_key_fields = ["number", "octets", "characters"]
user_value_fields = ["integer", "floating", "characters", "special", "timestamp", "document", "tuple", "octets"]

def validate_bundle_entries(bundle_builder: BundleBuilder) -> None:
    """Ensures entries in the bundle are valid for the container behavior. Throws a ValueError if not."""
    changes = bundle_builder.changes.values() # type: ignore
    for change in changes:
        assert isinstance(change, ChangeBuilder)

        if change.HasField("entry"):
            assert isinstance(change.entry, EntryBuilder)
            # Value is a oneof field, so the proto will have already ensured this is only one item.
            value_field_name: str = ""
            key_field_name: str = ""
            try:
                value_field_name = change.entry.value.ListFields()[0][0].name
            except IndexError:
                pass
            try:
                key_field_name = change.entry.key.ListFields()[0][0].name
            except IndexError:
                pass

            if change.entry.behavior == Behavior.BOX:
                if change.entry.HasField("key"):
                    raise ValueError("Bundle validation failed.")

                if not ((value_field_name in user_value_fields) or \
                change.entry.HasField("pointee")):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.SEQUENCE:
                if change.entry.HasField("key"):
                    raise ValueError("Bundle validation failed.")
                if not ((value_field_name in user_value_fields) or \
                change.entry.HasField("pointee")):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.PAIR_MAP:
                if not change.entry.HasField("pair"):
                    raise ValueError("Bundle validation failed.")
                if not ((value_field_name in user_value_fields) or \
                change.entry.HasField("pointee") or \
                change.entry.deletion):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.DIRECTORY:
                if not key_field_name in user_key_fields:
                    raise ValueError("Bundle validation failed.")
                if not ((value_field_name in user_value_fields) or \
                change.entry.HasField("pointee") or \
                change.entry.deletion):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.KEY_SET:
                if not key_field_name in user_key_fields:
                    raise ValueError("Bundle validation failed.")
                if change.entry.HasField("value"):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.GROUP:
                if not change.entry.HasField("describing"):
                    raise ValueError("Bundle validation failed.")
                if change.entry.HasField("value"):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.PAIR_SET:
                if not change.entry.HasField("pair"):
                    raise ValueError("Bundle validation failed.")
                if change.entry.HasField("value"):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.PROPERTY:
                if not change.entry.HasField("describing"):
                    raise ValueError("Bundle validation failed.")
                if not ((value_field_name in user_value_fields) or \
                change.entry.HasField("pointee") or \
                change.entry.deletion):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.BRAID:
                if not change.entry.HasField("describing"):
                    raise ValueError("Bundle validation failed.")
                if not (value_field_name in ("integer", "floating") or \
                change.entry.deletion):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.VERTEX:
                if not change.entry.HasField("container"):
                    raise ValueError("Bundle validation failed.")

            elif change.entry.behavior == Behavior.EDGE_TYPE:
                if not change.entry.HasField("pair"):
                    raise ValueError("Bundle validation failed.")

            else:
                raise ValueError(f"unknown behavior: {change.entry.behavior}")
