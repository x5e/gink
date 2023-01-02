#!/usr/bin/env python3
from random import randint
from typing import Optional, Dict
from datetime import datetime, date, timedelta
from threading import Lock
from websockets import WebSocketCommonProtocol
import time
import os
import math
from logging import getLogger
from google.protobuf.message import Message

from ..builders.sync_message_pb2 import SyncMessage

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp
from .tuples import Chain
from .peer import Peer

class Database:
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _lock: Lock
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _peers: Dict[int, Peer]

    def __init__(self, store: AbstractStore):
        self._i_have = store.get_chain_tracker()
        Database.last = self
        self._store = store
        self._chain: Optional[Chain] = None
        self._lock = Lock()
        self._last_time = None
        self._peers = {}
        self._count_peers = 0
        self._logger = getLogger(self.__class__.__name__)

    def _add_info(self, bundler: Bundler):
        # TODO[P2]: add info about this instance
        assert bundler is not None
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
            time.sleep(1e-5)
        self._last_time = now
        return now

    def resolve_timestamp(self, as_of: GenericTimestamp = None) -> MuTimestamp:
        """ translates an abstract time into a real timestamp

            date and datetime behave as you might expect (turned into unix time)

            integers and floats that look like timestamps or microsecond timestamps are
            treated as such.

            integers >= 0 are treated as "right after the <index> commit"

            intergers < 0 are treated as "right before the <index> commit)
        """
        if as_of is None:
            return self.get_now()
        if isinstance(as_of, timedelta):
            return self.get_now() + int(as_of.total_seconds() * 1e6)
        if isinstance(as_of, date):
            as_of = datetime(as_of.year, as_of.month, as_of.day)
        if isinstance(as_of, datetime):
            as_of = as_of.timestamp()
        if isinstance(as_of, (int, float)):
            if as_of > 1671697316392367 and as_of < 2147483648000000:
                # appears to be a microsecond timestamp
                return int(as_of)
            if as_of > 1671697630 and as_of < 2147483648:
                # appears to be seconds since epoch
                return int(as_of * 1e6)
        if isinstance(as_of, int) and as_of < 1e6 and as_of > -1e6:
                bundle_info = self._store.get_one(BundleInfo, int(as_of))
                if bundle_info is None:
                    raise ValueError("don't have that many bundles")
                assert isinstance(bundle_info, BundleInfo)
                return bundle_info.timestamp + int(as_of >= 0)
        if isinstance(as_of, float) and as_of < 1e6 and as_of > -1e6:
            return self.get_now() + int(1e6*as_of)
        raise ValueError(f"don't know how to resolve {as_of} into a timestamp")

    def _get_writable_chain(self) -> Chain:
        """ returns a chain that this database can append to """
        if self._chain:
            return self._chain
        # TODO[P2]: implement locks as part of the store interface to prevent races to get chains
        # TODO[P2]: reuse claimed chains
        medallion =  randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = self.get_now()
        chain = Chain(medallion=Medallion(medallion), chain_start=chain_start)
        starting_bundler = Bundler()
        self._add_info(starting_bundler)
        info = BundleInfo(medallion=medallion, chain_start=chain_start, timestamp=chain_start)
        bundle_bytes = starting_bundler.seal(info)
        self._store.apply_bundle(bundle_bytes=bundle_bytes)
        self._i_have.mark_as_having(info)
        self._store.claim_chain(chain)
        self._chain = chain
        return chain
    
    def add_bundle(self, bundler: Bundler) -> BundleInfo:
        """ seals bundler and adds the resulting bundle to the local store """
        assert not bundler.sealed
        with self._lock:
            chain = self._get_writable_chain()
            seen_to = self._i_have.get_seen_to(chain)
            assert seen_to is not None
            timestamp = self.get_now()
            assert timestamp > seen_to
            info = BundleInfo(chain=chain, timestamp=timestamp, prior_time=seen_to)
            info_with_comment, _ = self._store.apply_bundle(bundle_bytes=bundler.seal(info))
            return info_with_comment

    async def _on_new_connection(self, connection: WebSocketCommonProtocol, peer_info):
        self._count_peers += 1
        peer = self._peers[self._count_peers] = Peer(connection, peer_info)
        await peer.send_greeting(self._store.get_chain_tracker())
        sync_message = SyncMessage()
        assert isinstance(sync_message, Message)
        while True:
            received = await connection.recv()
            if isinstance(received, str):
                self._logger.info("received string message: %s", received)
                continue
            sync_message.ParseFromString(received)
            