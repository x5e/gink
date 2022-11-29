""" some general tests of the Database class """
from database import Database
from memory_store import MemoryStore

def test_database():
    """ tests that the last() thing works """
    store = MemoryStore()
    database = Database(store=store)
    last = Database.last()
    assert last == database
