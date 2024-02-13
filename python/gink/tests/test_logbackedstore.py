from select import select
from logging import getLogger
_logger = getLogger(__name__)

from .. import *

def test_notification():
    fn = "/tmp/test_logbackedstore.tmp"
    store1 = LogBackedStore(fn)
    store2 = LogBackedStore(fn)

    assert store2.is_selectable()
    bundle_info = store1.acquire_appendable_chain()
    assert bundle_info.chain_start == bundle_info.timestamp
    before = generate_timestamp()
    ready_readers, _, _ = select([store2], [], [], .1)
    after = generate_timestamp()
    _logger.debug(f"select took {after-before} microseconds")
    assert store2 in ready_readers
