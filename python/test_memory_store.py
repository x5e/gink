""" Runs the store tests against the memory store. """

import test_store
from test_store import install_tests  # pylint complains about test_store.install_tests
from memory_store import MemoryStore

install_tests(globals(), test_store, MemoryStore)
