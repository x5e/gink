#!/usr/bin/env python3
from random import randint  # TODO: use a better RNG
from typing import Optional
import threading
import time
import os
import math
from abstract_store import AbstractStore
from chain_tracker import ChainTracker
from change_set import ChangeSet
from change_set_info import ChangeSetInfo
from typedefs import Chain, Medallion, MuTimestamp


class Database:
    """ Gink Database that all change sets go through. """
    _i_have: ChainTracker

    def __init__(self, store: AbstractStore):
        self._i_have = store.get_chain_tracker()
        Database._last = self
        self._store = store
        self._chain: Optional[Chain] = None
        self._lock = threading.Lock()
        self._last_time = None

    def _add_info(self, change_set: ChangeSet):
        # TODO[P2]: add info about this instance
        assert change_set
        assert os

    def how_soon_is_now(self) -> MuTimestamp:
        """ returns the current time in microseconds since epoch

            does a busy wait if needed to ensure no duplicate timestamps and
            that the timestamps returned are monotonically increasing
        """
        while True:
            now = math.floor(time.time() * 1_000_000)
            if self._last_time is None or now > self._last_time:
                break
        self._last_time = now
        return MuTimestamp(now)

    def _get_chain(self) -> Chain:
        if self._chain:
            return self._chain
        # TODO[P2]: implement locks as part of the store interface to prevent races to get chains
        # TODO[P2]: reuse claimed chains
        medallion =  randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = self.how_soon_is_now()
        chain = Chain(medallion=Medallion(medallion), chain_start=MuTimestamp(chain_start))
        starting_change_set = ChangeSet()
        self._add_info(starting_change_set)
        info = ChangeSetInfo(medallion=medallion, chain_start=chain_start, timestamp=chain_start)
        change_set_bytes = starting_change_set.seal(info)
        self._store.add_commit(change_set_bytes=change_set_bytes)
        self._i_have.mark_as_having(info)
        self._store.claim_chain(chain)
        self._chain = chain
        return chain

    def add_change_set(self, change_set: ChangeSet) -> ChangeSetInfo:
        """ adds an unsealed change set to the local store """
        assert not change_set.sealed
        with self._lock:
            chain = self._get_chain()
            seen_to = self._i_have.get_seen_to(chain)
            assert seen_to is not None
            timestamp = self.how_soon_is_now()
            assert timestamp > seen_to
            info = ChangeSetInfo(chain=chain, timestamp=timestamp, prior_time=seen_to)
            change_set_bytes = change_set.seal(info)
            info_with_comment, added = self._store.add_commit(change_set_bytes=change_set_bytes)
            assert added, "How did you already have this change set? I just made it !!!"
            return info_with_comment

    @staticmethod
    def last():
        """ returns the last database created """
        return Database._last


if __name__ == "__main__":
    import sys
    globals()[sys.argv[1]]()
