from select import select
from logging import getLogger
from platform import system
from nacl.signing import SigningKey
from typing import *

from ..impl.utilities import generate_medallion, generate_timestamp
from ..impl.typedefs import MuTimestamp, Medallion
from ..impl.builders import BundleBuilder

_logger = getLogger(__name__)

from .. import *

def create_test_bundle(
        timestamp: Optional[MuTimestamp] = None,
        comment: Optional[str] = None,
        chain_start: Optional[MuTimestamp] = None,
        medallion: Optional[Medallion] = None,
        signing_key: Optional[SigningKey] = None,
        identity: Optional[str] = None,
    ) -> bytes:
    """ A utility function for creating empty bundles with given metadata. """
    timestamp = timestamp or generate_timestamp()
    chain_start = chain_start or timestamp
    bundle_builder = BundleBuilder()
    bundle_builder.previous
    if comment:
        bundle_builder.comment = comment
    bundle_builder.chain_start = chain_start
    bundle_builder.medallion = medallion or generate_medallion()
    bundle_builder.timestamp = timestamp
    if identity:
        bundle_builder.identity = identity
    if signing_key is None:
        signing_key = SigningKey.generate()
    if timestamp == chain_start:
        verify_key = bytes(signing_key.verify_key)
        assert len(verify_key) == 32, verify_key
        bundle_builder.verify_key = verify_key
    unsigned_bytes = bundle_builder.SerializeToString()
    signed = signing_key.sign(unsigned_bytes)
    return signed


def test_notification():
    if system() != "Linux":
        return
    fn = "/tmp/test_logbackedstore.tmp"
    store1 = LogBackedStore(fn)
    store2 = LogBackedStore(fn)
    signing_key = SigningKey.generate()
    assert store2.is_selectable()
    test_bundle = create_test_bundle(identity="whoami", signing_key=signing_key)
    store1.apply_bundle(test_bundle)
    before = generate_timestamp()
    ready_readers, _, _ = select([store2], [], [], .1)
    after = generate_timestamp()
    _logger.debug(f"select took {after-before} microseconds")
    assert store2 in ready_readers
