#!/usr/bin/env python3
from random import randint
from typing import Optional, Set, Union, Iterable, Tuple
from datetime import datetime, date, timedelta
from threading import Lock
import time
import os
import math
import re
import sys
from logging import getLogger
from google.protobuf.message import Message
from select import select
from pwd import getpwuid
from socket import gethostname

from ..builders.sync_message_pb2 import SyncMessage
from ..builders.entry_pb2 import Entry as EntryBuilder

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp
from .tuples import Chain
from .peer import Peer
from .wspeer import WsPeer
from .listener import Listener
from .coding import DIRECTORY, encode_key, encode_value
from .muid import Muid

class Database:
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _lock: Lock
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _peers: Set[Peer]
    _listeners: Set[Listener]

    def __init__(self, store: AbstractStore):
        Database.last = self
        self._store = store
        self._last_bundle_info: Optional[BundleInfo] = None
        self._lock = Lock()
        self._last_time = None
        self._peers = set()
        self._logger = getLogger(self.__class__.__name__)
        self._listeners = set()

    def _get_info(self) -> Iterable[Tuple[str, Union[str, int]]]:
        yield (".process.id", os.getpid())
        user_data = getpwuid(os.getuid())
        yield (".user.name", user_data[0])
        yield (".full.name", user_data[4])
        yield (".host.name", gethostname())
        if sys.argv[0]:
            yield (".software", sys.argv[0])

    def _add_info(self, bundler: Bundler):
        personal_directory = Muid(-1, 0, DIRECTORY)
        entry_builder = EntryBuilder()
        for key, val in self._get_info():
            entry_builder.behavior = DIRECTORY
            personal_directory.put_into(entry_builder.container)
            encode_key(key, entry_builder.key)
            encode_value(val, entry_builder.value)
            bundler.add_change(entry_builder)

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

    def resolve_timestamp(self, timestamp: GenericTimestamp = None) -> MuTimestamp:
        """ translates an abstract time into a real timestamp

            date and datetime behave as you might expect (turned into unix time)

            integers and floats that look like timestamps or microsecond timestamps are
            treated as such.

            integers >= 0 are treated as "right after the <index> commit"

            intergers < 0 are treated as "right before the <index> commit)
        """
        if timestamp is None:
            return self.get_now()
        if isinstance(timestamp, timedelta):
            return self.get_now() + int(timestamp.total_seconds() * 1e6)
        if isinstance(timestamp, date):
            timestamp = datetime(timestamp.year, timestamp.month, timestamp.day)
        if isinstance(timestamp, datetime):
            timestamp = timestamp.timestamp()
        if isinstance(timestamp, (int, float)):
            if timestamp > 1671697316392367 and timestamp < 2147483648000000:
                # appears to be a microsecond timestamp
                return int(timestamp)
            if timestamp > 1671697630 and timestamp < 2147483648:
                # appears to be seconds since epoch
                return int(timestamp * 1e6)
        if isinstance(timestamp, int) and timestamp < 1e6 and timestamp > -1e6:
                bundle_info = self._store.get_one(BundleInfo, int(timestamp))
                if bundle_info is None:
                    raise ValueError("don't have that many bundles")
                assert isinstance(bundle_info, BundleInfo)
                return bundle_info.timestamp + int(timestamp >= 0)
        if isinstance(timestamp, float) and timestamp < 1e6 and timestamp > -1e6:
            return self.get_now() + int(1e6*timestamp)
        raise ValueError(f"don't know how to resolve {timestamp} into a timestamp")

    def _start_chain(self) -> BundleInfo:
        medallion = randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = self.get_now()
        chain = Chain(medallion=Medallion(medallion), chain_start=chain_start)
        self._store.claim_chain(chain)
        starting_bundler = Bundler()
        self._add_info(starting_bundler)
        info = BundleInfo(medallion=medallion, chain_start=chain_start, timestamp=chain_start)
        # We can't use Database.commit because Database.commit calls this function.
        bundle_bytes = starting_bundler.seal(info)
        bundle_info = self._receive_bundle(bundle_bytes, from_peer=None)
        assert bundle_info, "expected a newly created bundle to be added"
        return bundle_info
    
    def commit(self, bundler: Bundler) -> BundleInfo:
        """ seals bundler and adds the resulting bundle to the local store """
        assert not bundler.sealed
        with self._lock:
            if not self._last_bundle_info:
                # TODO[P3]: reuse claimed chains of processes that have exited on this machine
                self._last_bundle_info = self._start_chain()
            chain = self._last_bundle_info.get_chain()
            seen_to = self._last_bundle_info.timestamp
            assert seen_to is not None
            timestamp = self.get_now()
            assert timestamp > seen_to
            info = BundleInfo(chain=chain, timestamp=timestamp, previous=seen_to)
            bundle_bytes = bundler.seal(info)
            info_with_comment = self._receive_bundle(bundle_bytes, from_peer=None)
            assert info_with_comment is not None
            self._last_bundle_info = info_with_comment
            return info_with_comment

    def _receive_bundle(self, bundle: bytes, from_peer: Optional[Peer]) -> Optional[BundleInfo]:
        """ called when either a bundle is received from a remote peer or one is created locally
        
            We're assuming that each peer has been sent all data in the local store.
            In order to maintain that invariant, each peer must be sent each new bundle added.

            Since the invariant is potentially not true while in the process of sending
            bundles to peers, we need to aquire and hold the lock to call this function.

            The "peer" argument indicates which peer this bundle came from.  We need to know 
            where it came from so we don't send the same data back.

            If this bundle has already been processed by the local store, then we know
            that it's also been sent to each peer and so can be ignored.
        """
        info, added = self._store.apply_bundle(bundle)
        if from_peer is not None and from_peer.tracker is not None:
            from_peer.tracker.mark_as_having(info)
        if not added:
            return None
        sync_message = SyncMessage()
        sync_message.bundle = bundle # type: ignore
        assert isinstance(sync_message, Message)
        serialized: bytes = sync_message.SerializeToString()
        for peer in self._peers:
            if peer == from_peer:
                # We got this bundle from this peer, so don't need to send it back to them.
                continue
            if peer.tracker is None:
                # In this case we haven't received a greeting from the peer, and so don't want to
                # send any bundles because it might result in gaps in their chain.
                continue
            if peer.tracker.has(info):
                # In this case the peer has indicated they already have this bundle, probably
                # via their greeting message, so we don't need to send it to them again.
                continue
            peer.send(serialized)
        return info
    
    def _receive_data(self, received: bytes, from_peer: Peer):
        with self._lock:
            sync_message = SyncMessage()
            assert isinstance(sync_message, Message)
            sync_message.ParseFromString(received)
            if sync_message.HasField("bundle"):
                bundle_bytes = sync_message.bundle # type: ignore
                self._receive_bundle(bundle_bytes, from_peer)
            elif sync_message.HasField("greeting"):
                raise NotImplementedError()
            elif sync_message.HasField("ack"):
                self._logger.warning("got ack, not implemeneted !")
            else:
                self._logger.warning("got binary message without ack, bundle, or greeting")

    def start_listening(self, ip="", port: Union[str, int]="8080"):
        self._listeners.add(Listener(WsPeer, ip=ip, port=port))

    def connect_to(self, target: str):
        match = re.fullmatch(r"(ws+://)?([a-z0-9.-]+)(?:(:\d+))?(?:/+(.*))?$", target, re.I)
        assert match, f"can't connect to: {target}"
        prefix, host, port, path = match.groups()
        if prefix and prefix != "ws://":
            raise NotImplementedError("only vanilla websockets currently supported")

    def run(self, until: GenericTimestamp=None):
        readers = []
        for listener in self._listeners:
            readers.append(listener)
        for peer in self._peers:
            readers.append(peer)
        if until is not None:
            until = self.resolve_timestamp(until)
        while until is None or self.get_now() < until:
            # TODO: use epoll where supported
            ready = select(readers, [], [], 0.01)
            for ready_reader in ready[0]:
                if isinstance(ready_reader, Peer):
                    for data in ready_reader.receive():
                        self._receive_data(data, ready_reader)
                elif isinstance(ready_reader, Listener):
                    peer: Peer = ready_reader.accept()
                    self._peers.add(peer)
                    sync_message = self._store.get_chain_tracker().to_greeting_message()
                    assert isinstance(sync_message, Message)
                    greeting_bytes = sync_message.SerializeToString()
                    peer.send(greeting_bytes)
