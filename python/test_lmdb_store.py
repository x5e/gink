""" Runs the store tests against the memory store. """
import os
from contextlib import closing

from google.protobuf.text_format import Parse

from change_set_pb2 import ChangeSet as ChangeSetBuilder

from lmdb_store import LmdbStore
from muid import Muid
import test_store
from test_store import install_tests  # pylint complains about test_store.install_tests

TEST_FILE = "/tmp/test.gink.mdb"

def maker():
    """ makes a file for testing """
    if os.path.exists(TEST_FILE):
        os.unlink(TEST_FILE)
    return LmdbStore(TEST_FILE)

install_tests(globals(), test_store, maker)
