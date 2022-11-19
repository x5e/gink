""" Runs the store tests against the memory store. """
from typing import Callable
import test_store
from memory_store import MemoryStore

def curried(a_function, some_data) -> Callable[[], None]:
    """ returns a function with the first argument applied to the second """
    def wrapped():
        a_function(some_data)
    return wrapped

for name in dir(test_store):
    if name.startswith("generic_test"):
        new_name = name.replace("generic_", "")
        new_func = curried(getattr(test_store, name), MemoryStore)
        new_func.__name__ = new_name
        globals()[new_name] = new_func
