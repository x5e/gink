""" Runs the store tests against the memory store. """

from .test_store import *
from ..impl.memory_store import MemoryStore

install_tests(globals(), globals(), MemoryStore)

if __name__ == "__main__":
    print(dir())
