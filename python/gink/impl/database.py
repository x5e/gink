#!/usr/bin/env python3
""" contains the Database class """

# standard python modules
from random import randint
from typing import Optional, Set, Union, Iterable, Tuple, Dict, Any, List
from datetime import datetime, date, timedelta
from threading import Lock
from select import select
from pwd import getpwuid
from socket import gethostname
from os import getuid, getpid, environ
from time import time, sleep
from sys import stdout, argv
from math import floor
from logging import getLogger, basicConfig, FileHandler
from re import fullmatch, IGNORECASE

# builders
from .builders import SyncMessage, EntryBuilder, ContainerBuilder

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp, EPOCH
from .tuples import Chain
from .connection import Connection
from .websocket_connection import WebsocketConnection
from .listener import Listener
from .coding import DIRECTORY, encode_key, encode_value
from .muid import Muid
from .chain_tracker import ChainTracker
from .attribution import Attribution
from .lmdb_store import LmdbStore
from .memory_store import MemoryStore

basicConfig(level=environ.get("GINK_LOG_LEVEL", "INFO"))


class Database:
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _lock: Lock
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _connections: Set[Connection]
    _listeners: Set[Listener]
    _sent_but_not_acked: Set[BundleInfo]
    _trackers: Dict[Connection, ChainTracker]  # tracks what we know a peer has *received*
    _last_link: Optional[BundleInfo]

    def __init__(self, store: Union[AbstractStore, str, None] = None):
        setattr(Database, "_last", self)
        if isinstance(store, str):
            store = LmdbStore(store)
        if isinstance(store, type(None)):
            store = MemoryStore()
        assert isinstance(store, AbstractStore)
        self._store = store
        self._last_link = None
        self._lock = Lock()
        self._last_time = None
        self._connections = set()
        self._listeners = set()
        self._trackers = {}
        self._sent_but_not_acked = set()
        self._logger = getLogger(self.__class__.__name__)

    @staticmethod
    def get_last():
        last = getattr(Database, "_last")
        assert isinstance(last, Database)
        return last

    def get_store(self) -> AbstractStore:
        """ returns the store managed by this database """
        return self._store

    def get_chain(self) -> Optional[Chain]:
        """ gets the chain this database is appending to (or None if it hasn't started writing yet) """
        if self._last_link is not None:
            return self._last_link.get_chain()
        return None

    @staticmethod
    def _get_info() -> Iterable[Tuple[str, Union[str, int]]]:
        yield ".process.id", getpid()
        user_data = getpwuid(getuid())
        yield ".user.name", user_data[0]
        if user_data[4] != user_data[0]:
            yield ".full.name", user_data[4]
        yield ".host.name", gethostname()
        if argv[0]:
            yield ".software", argv[0]

    def _add_info(self, bundler: Bundler):
        personal_directory = Muid(-1, 0, DIRECTORY)
        entry_builder = EntryBuilder()
        for key, val in self._get_info():
            # pylint: disable=maybe-no-member
            setattr(entry_builder, "behavior", DIRECTORY)
            personal_directory.put_into(getattr(entry_builder, "container"))
            encode_key(key, getattr(entry_builder, "key"))
            encode_value(val, entry_builder.value)  # type: ignore
            bundler.add_change(entry_builder)

    def get_now(self) -> MuTimestamp:
        """ returns the current time in microseconds since epoch

            sleeps if needed to ensure no duplicate timestamps and
            that the timestamps returned are monotonically increasing
        """
        while True:
            now = floor(time() * 1_000_000)
            if self._last_time is None or now > self._last_time:
                break
            sleep(1e-5)
        self._last_time = now
        return now

    def resolve_timestamp(self, timestamp: GenericTimestamp = None) -> MuTimestamp:
        """ translates an abstract time into a real timestamp

            date and datetime behave as you might expect (turned into unix time)

            integers and floats that look like timestamps or microsecond timestamps are
            treated as such.

            small integers are treated as "right before the <index> commit"
        """
        if timestamp is None:
            return self.get_now()
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        if isinstance(timestamp, Muid):
            muid_timestamp = timestamp.timestamp
            if not isinstance(muid_timestamp, MuTimestamp):
                raise ValueError("muid doesn't have a resolved timestamp")
            return muid_timestamp
        if isinstance(timestamp, timedelta):
            return self.get_now() + int(timestamp.total_seconds() * 1e6)
        if isinstance(timestamp, date):
            timestamp = datetime(timestamp.year, timestamp.month, timestamp.day)
        if isinstance(timestamp, datetime):
            timestamp = timestamp.timestamp()
        if isinstance(timestamp, (int, float)):
            if 1671697316392367 < timestamp < 2147483648000000:
                # appears to be a microsecond timestamp
                return int(timestamp)
            if 1671697630 < timestamp < 2147483648:
                # appears to be seconds since epoch
                return int(timestamp * 1e6)
        if isinstance(timestamp, int) and -1e6 < timestamp < 1e6:
            bundle_info = self._store.get_one(BundleInfo, int(timestamp))
            if bundle_info is None:
                raise ValueError("don't have that many bundles")
            assert isinstance(bundle_info, BundleInfo)
            return bundle_info.timestamp
        if isinstance(timestamp, float) and 1e6 > timestamp > -1e6:
            return self.get_now() + int(1e6 * timestamp)
        raise ValueError(f"don't know how to resolve {timestamp} into a timestamp")

    def _start_chain(self):
        medallion = randint((2 ** 48) + 1, (2 ** 49) - 1)
        chain_start = self.get_now()
        chain = Chain(medallion=Medallion(medallion), chain_start=chain_start)
        self._store.claim_chain(chain)
        starting_bundler = Bundler("(starting chain)")
        self._add_info(starting_bundler)
        # We can't use Database.commit because Database.commit calls this function.
        bundle_bytes = starting_bundler.seal(chain=chain, timestamp=chain_start)
        info, added = self._store.apply_bundle(bundle_bytes, True)
        assert added, "expected a newly created bundle to be added"
        self._logger.debug("started chain: %r", info)
        if self._connections:
            self._broadcast_bundle(bundle_bytes, info, from_peer=None)
        self._last_link = info

    def commit(self, bundler: Bundler) -> BundleInfo:
        """ seals bundler and adds the resulting bundle to the local store """
        assert not bundler.sealed
        with self._lock:  # using an exclusive lock to ensure that we don't fork a chain
            if not self._last_link:
                # TODO[P3]: reuse claimed chains of processes that have exited on this machine
                self._start_chain()
            last_link = self._last_link
            assert isinstance(last_link, BundleInfo)
            chain = last_link.get_chain()
            seen_to = last_link.timestamp
            assert seen_to is not None
            timestamp = self.get_now()
            assert timestamp > seen_to
            bundle_bytes = bundler.seal(chain=chain, timestamp=timestamp, previous=seen_to)
            info, added = self._store.apply_bundle(bundle_bytes, True)
            assert added, "didn't expect the store to already have a newly created bundle"
            self._last_link = info
            self._logger.debug("locally committed bundle: %r", info)
            if self._connections:
                self._broadcast_bundle(bundle_bytes, info, from_peer=None)
            return info

    def _broadcast_bundle(
            self,
            bundle: bytes,
            info: BundleInfo,
            from_peer: Optional[Connection]
    ) -> None:
        """ Sends a bundle either created locally or received from a peer to other peers.

            The "peer" argument indicates which peer this bundle came from.  We need to know
            where it came from so we don't send the same data back.
        """
        self._logger.debug("broadcasting %r from %r", info, from_peer)
        outbound_message_with_bundle = SyncMessage()
        outbound_message_with_bundle.bundle = bundle  # type: ignore
        for peer in self._connections:
            if peer == from_peer:
                # We got this bundle from this peer, so don't need to send the bundle back to them.
                # But we do need to send them an ack confirming that we've received it.
                continue
            tracker = self._trackers.get(peer)
            if tracker is None:
                # In this case we haven't received a greeting from the peer, and so don't want to
                # send any bundles because it might result in gaps in their chain.
                continue
            if tracker.has(info):
                # In this case the peer has indicated they already have this bundle, probably
                # via their greeting message, so we don't need to send it to them again.
                continue
            self._logger.debug("sending %r to %r", info, peer)
            peer.send(outbound_message_with_bundle)
        if from_peer is None:
            self._sent_but_not_acked.add(info)

    def _receive_data(self, sync_message: SyncMessage, from_peer: Connection):
        with self._lock:
            if sync_message.HasField("bundle"):
                bundle_bytes = sync_message.bundle  # type: ignore # pylint: disable=maybe-no-member
                info, added = self._store.apply_bundle(bundle_bytes, False)
                from_peer.send(info.as_acknowledgement())
                tracker = self._trackers.get(from_peer)
                if tracker is not None:
                    tracker.mark_as_having(info)
                if added:
                    self._broadcast_bundle(bundle_bytes, info, from_peer)
            elif sync_message.HasField("greeting"):
                self._logger.debug("received greeting from %s", from_peer)
                chain_tracker = ChainTracker(sync_message=sync_message)
                self._trackers[from_peer] = chain_tracker

                def callback(bundle_bytes: bytes, info: BundleInfo):
                    if not chain_tracker.has(info):
                        outgoing_builder = SyncMessage()
                        outgoing_builder.bundle = bundle_bytes  # type: ignore
                        from_peer.send(outgoing_builder)

                self._store.get_bundles(callback=callback)
            elif sync_message.HasField("ack"):
                acked_info = BundleInfo.from_ack(sync_message)
                tracker = self._trackers.get(from_peer)
                if tracker is not None:
                    tracker.mark_as_having(acked_info)
                self._store.remove_from_outbox([acked_info])
                if acked_info in self._sent_but_not_acked:
                    self._sent_but_not_acked.remove(acked_info)
            else:
                self._logger.warning("got binary message without ack, bundle, or greeting")

    def start_listening(self, ip_addr="", port: Union[str, int] = "8080"):
        """ Listen for incoming connections on the given port.

            Note that you'll still need to call "run" to actually accept those connections.
        """
        port = int(port)
        self._logger.debug("starting to listen on %r:%r", ip_addr, port)
        self._listeners.add(Listener(WebsocketConnection, ip_addr=ip_addr, port=port))

    def connect_to(self, target: str):
        """ initiate a connection to another gink instance """
        self._logger.debug("initating connection to %s", target)
        match = fullmatch(r"(ws+://)?([a-z0-9.-]+)(?::(\d+))?(?:/+(.*))?$", target, IGNORECASE)
        assert match, f"can't connect to: {target}"
        prefix, host, port, path = match.groups()
        if prefix and prefix != "ws://":
            raise NotImplementedError("only vanilla websockets currently supported")
        port = port or "8080"
        path = path or "/"
        greeting = self._store.get_chain_tracker().to_greeting_message()
        connection = WebsocketConnection(host=host, port=int(port), path=path, greeting=greeting)
        self._connections.add(connection)
        self._logger.debug("connection added")

    def run(self, until: GenericTimestamp = None):
        """ Waits for activity on ports then exchanges data with peers. """
        self._logger.debug("starting run loop until %r", until)
        if until is not None:
            until = self.resolve_timestamp(until)
        while until is None or self.get_now() < until:
            # eventually will want to support epoll on platforms where its supported
            readers: List[Union[Listener, Connection]] = []
            for listener in self._listeners:
                readers.append(listener)
            for connection in list(self._connections):
                if connection.is_closed():
                    self._connections.remove(connection)
                else:
                    readers.append(connection)
            try:
                ready = select(readers, [], [], 0.1)
            except KeyboardInterrupt:
                return
            for ready_reader in ready[0]:
                if isinstance(ready_reader, Connection):
                    for data in ready_reader.receive():
                        self._receive_data(data, ready_reader)
                elif isinstance(ready_reader, Listener):
                    sync_message = self._store.get_chain_tracker().to_greeting_message()
                    new_connection: Connection = ready_reader.accept(sync_message)
                    self._connections.add(new_connection)
                    self._logger.debug("accepted incoming connection from %s", new_connection)
            for info, bundle_bytes in self._store.read_through_outbox():
                if info not in self._sent_but_not_acked:
                    self._broadcast_bundle(bundle_bytes, info, None)

    def reset(self, to_time: GenericTimestamp = EPOCH, *, bundler=None, comment=None):
        """ Resets the database to a specific point in time.

            Note that it literally just "re"-sets everything in one big
            bundle to the values that existed at that time, so you can always
            go and look at the state of the database beforehand.
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        assert isinstance(bundler, Bundler)
        to_time = self.resolve_timestamp(to_time)
        for change in self._store.get_reset_changes(to_time=to_time, container=None, user_key=None):
            bundler.add_change(change)
        if immediate and len(bundler):
            self.commit(bundler=bundler)
        return bundler

    def get_container(self, muid: Muid, *,
                      behavior: Optional[int] = None,
                      container_builder: Optional[ContainerBuilder] = None) -> Any:
        """ gets (already created) container associated with a particular muid """
        _ = (self, muid, container_builder, behavior)
        raise Exception("not patched")

    def dump(self, as_of: GenericTimestamp = None, file=stdout) -> None:
        """ writes to file a pythonic representation of the database contents at the time """
        _ = (self, as_of, file)
        raise Exception("not patched")

    def get_attribution(self, timestamp: MuTimestamp, medallion: Medallion, *_) -> Attribution:
        """ Takes a timestamp and medallion and figures out who/what to blame the changes on.

            After the timestamp and medallion it will ignore other ordered arguments, so
            that it can be used via get_attribution(*muid).
        """
        _ = (self, timestamp, medallion)
        raise NotImplementedError()

    def log(self, limit: Optional[int] = -10) -> Iterable[Attribution]:
        """ Gets a list of attributions representing all bundles stored by the db. """
        for bundle_info in self._store.get_some(BundleInfo, limit):
            yield self.get_attribution(bundle_info.timestamp, bundle_info.medallion)

    def show_log(self, limit: Optional[int] = -10, file=stdout):
        """ Just prints the log to stdout in a human-readable format. """
        for attribution in self.log(limit=limit):
            print(attribution, file=file)

    def get_by_name(self, name: str, as_of: GenericTimestamp = None) -> List:
        """ Returns all containers of the given type with the given name.
        """
        returning = list()
        as_of_ts = self.resolve_timestamp(as_of)
        for found_container in self._store.get_by_name(name, as_of=as_of_ts):
            returning.append(self.get_container(found_container.address))
        return returning
