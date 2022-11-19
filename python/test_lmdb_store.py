""" Runs the store tests against the memory store. """
import os
import test_store
from test_store import install_tests  # pylint complains about test_store.install_tests
from lmdb_store import LmdbStore

TEST_FILE = "/tmp/test.gink.mdb"

def maker():
    """ makes a file for testing """
    if os.path.exists(TEST_FILE):
        os.unlink(TEST_FILE)
    return LmdbStore(TEST_FILE)

install_tests(globals(), test_store, maker)
