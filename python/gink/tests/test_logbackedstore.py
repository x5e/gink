from select import select
from logging import getLogger
from platform import system

_logger = getLogger(__name__)

from .. import *
from ..impl.tuples import Chain

def test_notification():
    if system() != "Linux":
        return
    fn = "/tmp/test_logbackedstore.tmp"
    store1 = LogBackedStore(fn)
    store2 = LogBackedStore(fn)

    assert store2.is_selectable()
    ts = generate_timestamp()
    store1.apply_bundle(Bundler("test").seal(Chain(chain_start=ts, medallion=0), ts))
    before = generate_timestamp()
    ready_readers, _, _ = select([store2], [], [], .1)
    after = generate_timestamp()
    _logger.debug(f"select took {after-before} microseconds")
    assert store2 in ready_readers
