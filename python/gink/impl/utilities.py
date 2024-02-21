from time import time as get_time, sleep
from math import floor
from os import getuid, getpid
from os.path import exists
from socket import gethostname
from pwd import getpwuid
from functools import wraps
from warnings import warn
from random import randint
from platform import system

from .typedefs import MuTimestamp, Medallion
from .tuples import Chain
from .builders import ClaimBuilder

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

def generate_timestamp(_last_time=[get_time()]) -> MuTimestamp:
    """ returns the current time in microseconds since epoch

        sleeps if needed to ensure no duplicate timestamps and
        that the timestamps returned are monotonically increasing
    """
    while True:
        now = floor(get_time() * 1_000_000)
        if now > _last_time[0]:
            break
        sleep(1e-5)
    _last_time[0] = now
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
    if system() == 'Linux' and exists("/proc") and not exists("/proc/%s" % process_id):
        return True
    # TODO(https://github.com/x5e/gink/issues/203) figure out a solution for macos
    return False

def create_claim(chain: Chain) -> ClaimBuilder:
    claim_builder = ClaimBuilder()
    claim_builder.claim_time = generate_timestamp()
    claim_builder.medallion = chain.medallion
    claim_builder.chain_start = chain.chain_start
    claim_builder.process_id = getpid()
    return claim_builder
