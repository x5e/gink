from time import time as get_time, sleep
from math import floor
from sys import argv
from os import getpid, getuid
from typing import Iterable, Tuple, Union
from socket import gethostname
from pwd import getpwuid
from functools import wraps
from warnings import warn

from .typedefs import MuTimestamp

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

def get_process_info() -> Iterable[Tuple[str, Union[str, int]]]:
    yield ".process.id", getpid()
    user_data = getpwuid(getuid())
    yield ".user.name", user_data[0]
    if user_data[4] != user_data[0]:
        yield ".full.name", user_data[4]
    yield ".host.name", gethostname()
    if argv[0]:
        yield ".software", argv[0]

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
