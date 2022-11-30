#!/usr/bin/env python3
from random import randint  # TODO: use a better RNG
from typing import Optional
import time
import math
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from change_set import ChangeSet
from typedefs import Chain, Medallion, ChainStart, MuTimestamp


class Database:
    """ Gink Database that all change sets go through. """
    _i_have: ChainTracker

    def __init__(self, store: AbstractStore):
        self._i_have = store.get_chain_tracker()
        Database._last = self
        self._store = store
        self._chain: Optional[Chain] = None

    def _get_chain(self) -> Chain:
        if self._chain:
            return self._chain
        # TODO: implement as part of the store interface to prevent races to get chains
        # TODO: reuse claimed chains
        medallion =  randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = math.floor(time.time() * 1_000_000)
        self._chain = Chain(medallion=Medallion(medallion), chain_start=ChainStart(MuTimestamp(chain_start)))

    def add_change_set(self, change_set: ChangeSet):
        """ adds a change set to the local store """
        
        self._store.add_commit()

    @staticmethod
    def last():
        """ returns the last database created """
        return Database._last


if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()
