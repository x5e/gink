from ..impl.lmdb_store import LmdbStore
from ..impl.utilities import generate_timestamp
from ..impl.bundler import Bundler
from ..impl.tuples import Chain
from nacl.signing import SigningKey

def test_identity():
    """ Tests that identity is properly set in first bundle
        and rejected in subsequent bundles.
    """
    ts = generate_timestamp()
    chain = Chain(chain_start=ts, medallion=0)

    store = LmdbStore()
    signing_key = SigningKey.generate()

    bundler = Bundler()
    bundler_bytes = bundler.seal(
        chain=chain,
        identity="test",
        timestamp=ts,
        signing_key=signing_key,
    )
    assert store.apply_bundle(bundler_bytes)

    # Should not be able to set identity in bundle that doesnt start the chain
    bundler2 = Bundler()
    failed = False
    try:
        bundler2.seal(
            chain=chain,
            identity="test2",
            timestamp=generate_timestamp(),
            signing_key=SigningKey.generate(),
        )
    except AssertionError:
        failed = True
    assert failed

    assert store.get_identity(chain) == "test"
