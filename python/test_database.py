""" some general tests of the Database class """
from typing import List
from database import Database
from memory_store import MemoryStore
from change_set import ChangeSet
from change_set_info import ChangeSetInfo

def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.last()
    assert last == database

def test_add_commit():
    """ tests that the add_commit works """
    store = MemoryStore()
    database = Database(store=store)
    started = database.how_soon_is_now()
    change_set = ChangeSet("just a test")
    database.add_change_set(change_set)
    commits: List[ChangeSetInfo] = []
    store.get_commits(lambda _, info: commits.append(info))
    assert len(commits) == 2
    assert commits[-1].comment == "just a test"
    assert commits[-1].timestamp > started
