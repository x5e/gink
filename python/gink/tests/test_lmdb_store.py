""" Runs the store tests against the memory store. """
import os

import pytest

from ..impl.lmdb_store import LmdbStore
from ..impl.watcher import Watcher
from .test_store import *  # pylint complains about test_store.install_tests

TEST_FILE = "/tmp/test.gink.mdb"


def maker():
    """ makes a file for testing """
    if os.path.exists(TEST_FILE):
        os.unlink(TEST_FILE)
    return LmdbStore(TEST_FILE)


install_tests(globals(), globals(), maker)


def test_bundle_no_retention():
    lmdb_store = LmdbStore(TEST_FILE, reset=True, retain_bundles=False)
    try:
        lmdb_store.get_bundles(lambda *_: None)
    except ValueError:
        return
    raise AssertionError("expected get_bundles to barf")


@pytest.mark.skipif(not Watcher.supported(), reason="file watcher is not available")
def test_close_closes_watcher():
    """Closing a file-backed store must release its watcher."""
    store = LmdbStore()
    try:
        assert store.is_selectable()
        watcher = store._get_watcher()
        assert watcher is not None and not watcher.closed

        store.close()

        assert watcher.closed
    finally:
        store.close()
