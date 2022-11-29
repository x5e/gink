#!/usr/bin/env python3
from directory import Directory
from memory_store import MemoryStore
from database import Database

def test_directory():
    store = MemoryStore()
    database = Database(store=store)
    global_directory = Directory.global_instance(database=database)
    global_directory["foo"] = "bar"
    result = global_directory["foo"]
    assert result == "bar"


if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()
    