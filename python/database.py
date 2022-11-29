#!/usr/bin/env python3
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from typedefs import Chain

class Database:
    _i_have: ChainTracker

    def __init__(self, store: AbstractStore):
        """ 
        @param local place to put commits and search for data and write updates to
        """
        self._i_have = store.get_chain_tracker()
        Database._last = self

    @staticmethod
    def last():
        return Database._last

def test_database():
    database = Database()
    last = Database.last()
    assert last == database

if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()