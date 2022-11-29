#!/usr/bin/env python3
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from change_set import ChangeSet
from typedefs import Chain

class Database:
    """ Gink Database that all change sets go through. """
    _i_have: ChainTracker

    def __init__(self, store: AbstractStore):
        self._i_have = store.get_chain_tracker()
        Database._last = self

    def add_change_set(self, change_set: ChangeSet):
        """ adds a change set to the local store """
        assert change_set
        raise NotImplementedError()

    @staticmethod
    def last():
        """ returns the last database created """
        return Database._last


if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()
