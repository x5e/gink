#!/usr/bin/env python3
from directory import Directory
from memory_store import MemoryStore
from database import Database

def test_directory():
    """ Test basic set/get functionality works. """
    store = MemoryStore()
    database = Database(store=store)
    started = database.how_soon_is_now()
    global_directory = Directory.global_instance(database=database)
    global_directory["foo"] = "bar"
    commits = []
    store.get_commits(lambda bytes, info: commits.append((bytes, info)))
    assert len(commits) == 2
    # result = global_directory["foo"]
    # assert result == "bar"


if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()
    