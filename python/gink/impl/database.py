#!/usr/bin/env python3
from random import randint
from typing import Optional
from datetime import datetime
import threading
import time
import os
import math

# gink modules
from .abstract_store import AbstractStore
from .chain_tracker import ChainTracker
from .change_set import ChangeSet
from .change_set_info import ChangeSetInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp
from .tuples import Chain


class Database:
    """ Gink Database that all change sets go through. """
    _i_have: ChainTracker

    def __init__(self, store: AbstractStore):
        self._i_have = store.get_chain_tracker()
        Database.last = self
        self._store = store
        self._chain: Optional[Chain] = None
        self._lock = threading.Lock()
        self._last_time = None

    def get_store(self):
        """ returns the store this database is reading/writing to """
        return self._store

    def _add_info(self, change_set: ChangeSet):
        # TODO[P2]: add info about this instance
        assert change_set is not None
        assert os

    def get_now(self) -> MuTimestamp:
        """ returns the current time in microseconds since epoch

            sleeps if needed to ensure no duplicate timestamps and
            that the timestamps returned are monotonically increasing
        """
        while True:
            now = math.floor(time.time() * 1_000_000)
            if self._last_time is None or now > self._last_time:
                break
            time.sleep(.0001)
        self._last_time = now
        return now

    def resolve_timestamp(self, as_of: GenericTimestamp) -> MuTimestamp:
        """ translates the abstract as of (which can be None or negative) into a real timestamp """
        if as_of is None:
            return self.get_now()
        if isinstance(as_of, datetime):
            as_of = as_of.timestamp()
        if isinstance(as_of, (int, float)):
            if as_of > 1671697316392367 and as_of < 2147483648000000:
                # appears to be a microsecond timestamp
                return int(as_of)
            if as_of > 1671697630 and as_of < 2147483648:
                # appears to be seconds since epoch
                return int(as_of * 1e6)
        # TODO: support negative as_of values
        raise NotImplementedError()

    def _get_chain(self) -> Chain:
        if self._chain:
            return self._chain
        # TODO[P2]: implement locks as part of the store interface to prevent races to get chains
        # TODO[P2]: reuse claimed chains
        medallion =  randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = self.get_now()
        chain = Chain(medallion=Medallion(medallion), chain_start=chain_start)
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
            timestamp = self.get_now()
            assert timestamp > seen_to
            info = ChangeSetInfo(chain=chain, timestamp=timestamp, prior_time=seen_to)
            change_set_bytes = change_set.seal(info)
            info_with_comment, added = self._store.add_commit(change_set_bytes=change_set_bytes)
            assert added, "How did you already have this change set? I just made it !!!"
            self._i_have.mark_as_having(info_with_comment)
            return info_with_comment