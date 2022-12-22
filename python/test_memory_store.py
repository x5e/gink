""" Runs the store tests against the memory store. """

import test_store
from test_store import install_tests, generic_test_get_ordered_entries
from memory_store import MemoryStore

install_tests(globals(), test_store, MemoryStore)

if __name__ == "__main__":
    generic_test_get_ordered_entries(MemoryStore)
