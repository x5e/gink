""" Runs the store tests against the memory store. """
import os

from ..impl.lmdb_store import LmdbStore
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
