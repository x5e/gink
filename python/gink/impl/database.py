#!/usr/bin/env python3
""" contains the Database class """

# standard python modules
from typing import Optional, Set, Union, Iterable, Dict, List, Callable, Mapping
from datetime import datetime, date, timedelta
from threading import Lock
from select import select
from sys import stdout
from logging import getLogger
from re import fullmatch, IGNORECASE
from contextlib import nullcontext

# builders
from .builders import SyncMessage, ContainerBuilder

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp, EPOCH
from .tuples import Chain
from .connection import Connection
from .websocket_connection import WebsocketConnection
from .listener import Listener
from .muid import Muid
from .chain_tracker import ChainTracker
from .attribution import Attribution
from .lmdb_store import LmdbStore
from .memory_store import MemoryStore
from .selectable_console import SelectableConsole
from .bundle_wrapper import BundleWrapper
from .utilities import generate_timestamp, experimental, get_identity, is_certainly_gone, generate_medallion


class Database:
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _lock: Lock
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _connections: Set[Connection]
    _listeners: Set[Listener]
    _sent_but_not_acked: Set[BundleInfo]
    _trackers: Dict[Connection, ChainTracker]  # tracks what we know a peer has
    _last_link: Optional[BundleInfo]
    _container_types: dict = {}

    def __init__(self,
                 store: Union[AbstractStore, str, None] = None,
                 identity = get_identity()):
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
        self._identity = identity
        self._sent_but_not_acked = set()
        self._logger = getLogger(self.__class__.__name__)
        self._callbacks: List[Callable[[BundleInfo], None]] = list()

    @experimental
    def add_callback(self, callback: Callable[[BundleInfo], None]):
        self._callbacks.append(callback)

    @staticmethod
    def get_last():
        last = getattr(Database, "_last")
        assert isinstance(last, Database)
        return last

    @classmethod
    def register_container_type(cls, container_cls: type):
        assert hasattr(container_cls, "BEHAVIOR")
        behavior = getattr(container_cls, "BEHAVIOR")
        cls._container_types[behavior] = container_cls

    def get_store(self) -> AbstractStore:
        """ returns the store managed by this database """
        return self._store

    def get_chain(self) -> Optional[Chain]:
        """ gets the chain this database is appending to (or None if it hasn't started writing yet) """
        if self._last_link is not None:
            return self._last_link.get_chain()
        return None

    def get_now(self):
        return generate_timestamp()

    def resolve_timestamp(self, timestamp: GenericTimestamp = None) -> MuTimestamp:
        """ translates an abstract time into a real timestamp

            date and datetime behave as you might expect (turned into unix time)

            integers and floats that look like timestamps or microsecond timestamps are
            treated as such.

            small integers are treated as "right before the <index> commit"
        """
        if timestamp is None:
            return generate_timestamp()
        if isinstance(timestamp, str):
            if fullmatch(r"-?\d+", timestamp):
                timestamp = int(timestamp)
            else:
                timestamp = datetime.fromisoformat(timestamp)
        if isinstance(timestamp, Muid):
            muid_timestamp = timestamp.timestamp
            if not isinstance(muid_timestamp, MuTimestamp):
                raise ValueError("muid doesn't have a resolved timestamp")
            return muid_timestamp
        if isinstance(timestamp, timedelta):
            return generate_timestamp() + int(timestamp.total_seconds() * 1e6)
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
            return generate_timestamp() + int(1e6 * timestamp)
        raise ValueError(f"don't know how to resolve {timestamp} into a timestamp")

    def _acquire_appendable_chain(self) -> BundleInfo:
        """ Either starts a chain or finds one to reuse, then returns the last link in it.
        """
        reused = self._store.maybe_reuse_chain(self._identity)
        if reused:
            return reused
        medallion = generate_medallion()
        chain_start = generate_timestamp()
        chain = Chain(medallion=medallion, chain_start=chain_start)
        bundler = Bundler(self._identity)
        bundle_bytes = bundler.seal(chain=chain, timestamp=chain_start)
        wrapper = BundleWrapper(bundle_bytes=bundle_bytes)
        self._store.apply_bundle(wrapper, self._on_bundle, True)
        return wrapper.get_info()

    def commit(self, bundler: Bundler) -> BundleInfo:
        """ seals bundler and adds the resulting bundle to the local store """
        assert not bundler.sealed
        with self._lock:  # using an exclusive lock to ensure that we don't fork a chain
            if not self._last_link:
                self._last_link = self._acquire_appendable_chain()
            chain = self._last_link.get_chain()
            seen_to = self._last_link.timestamp
            assert seen_to is not None
            timestamp = generate_timestamp()
            assert timestamp > seen_to
            bundle_bytes = bundler.seal(chain=chain, timestamp=timestamp, previous=seen_to)
            wrap = BundleWrapper(bundle_bytes)
            added = self._store.apply_bundle(wrap, self._on_bundle, False)
            assert added
            info = wrap.get_info()
            self._last_link = info
            self._logger.debug("locally committed bundle: %r", info)
            return info

    def _on_bundle(self, bundle_bytes: bytes, bundle_info: BundleInfo) -> None:
        """ Sends a bundle either created locally or received from a peer to other peers.
        """
        outbound_message_with_bundle = SyncMessage()
        outbound_message_with_bundle.bundle = bundle_bytes  # type: ignore
        for peer in self._connections:
            tracker = self._trackers.get(peer)
            if tracker is None:
                # In this case we haven't received a greeting from the peer, and so don't want to
                # send any bundles because it might result in gaps in their chain.
                continue
            if tracker.has(bundle_info):
                # peer already has or has been previously sent this bundle
                continue
            self._logger.debug("sending %r to %r", bundle_info, peer)
            peer.send(outbound_message_with_bundle)
            tracker.mark_as_having(bundle_info)
        for callback in self._callbacks:
            callback(bundle_info)

    def _receive_data(self, sync_message: SyncMessage, from_peer: Connection):
        with self._lock:
            if sync_message.HasField("bundle"):
                bundle_bytes = sync_message.bundle  # type: ignore # pylint: disable=maybe-no-member
                wrap = BundleWrapper(bundle_bytes)
                info = wrap.get_info()
                if (tracker := self._trackers.get(from_peer)):
                    tracker.mark_as_having(info)
                self._store.apply_bundle(wrap, self._on_bundle)
                from_peer.send(info.as_acknowledgement())
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
                from_peer.set_replied_to_greeting()
            elif sync_message.HasField("ack"):
                acked_info = BundleInfo.from_ack(sync_message)
                tracker = self._trackers.get(from_peer)
                if tracker is not None:
                    tracker.mark_as_having(acked_info)
                if acked_info in self._sent_but_not_acked:
                    self._sent_but_not_acked.remove(acked_info)
            else:
                self._logger.warning("got binary message without ack, bundle, or greeting")

    def start_listening(self, ip_addr="", port: Union[str, int] = "8080"):
        """ Listen for incoming connections on the given port.

            Note that you'll still need to call "run" to actually accept those connections.
        """
        port = int(port)
        self._logger.info("starting to listen on %r:%r", ip_addr, port)
        self._listeners.add(Listener(WebsocketConnection, ip_addr=ip_addr, port=port))

    def connect_to(self, target: str):
        """ initiate a connection to another gink instance """
        self._logger.info("initating connection to %s", target)
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

    def run(self,
            until: GenericTimestamp = None,
            console: Optional[SelectableConsole]=None):
        """ Waits for activity on ports then exchanges data with peers. """
        self._logger.debug("starting run loop until %r", until)
        if until is not None:
            until = self.resolve_timestamp(until)
        context_manager = console or nullcontext()
        with context_manager:
            while (until is None or generate_timestamp() < until):
                # eventually will want to support epoll on platforms where its supported
                readers: List[Union[Listener, Connection, SelectableConsole, AbstractStore]] = []
                if self._store.is_selectable():
                    readers.append(self._store)
                for listener in self._listeners:
                    readers.append(listener)
                for connection in list(self._connections):
                    if connection.is_closed():
                        self._connections.remove(connection)
                    else:
                        readers.append(connection)
                if isinstance(console, SelectableConsole):
                    readers.append(console)
                if console:
                    console.refresh()
                ready_readers, _, _ = select(readers, [], [], 0.1)
                for ready_reader in ready_readers:
                    if isinstance(ready_reader, Connection):
                        for data in ready_reader.receive():
                            self._receive_data(data, ready_reader)
                    elif isinstance(ready_reader, Listener):
                        sync_message = self._store.get_chain_tracker().to_greeting_message()
                        new_connection: Connection = ready_reader.accept(sync_message)
                        self._connections.add(new_connection)
                        self._logger.info("accepted incoming connection from %s", new_connection)
                    elif isinstance(ready_reader, SelectableConsole):
                        ready_reader.call_when_ready()
                    elif isinstance(ready_reader, AbstractStore):
                        ready_reader.refresh(self._on_bundle)

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

    def get_container(
            self,
            muid: Muid, *,
            container_builder: Optional[ContainerBuilder] = None,
            behavior: Optional[int] = None,
        ):
        """ Gets a pre-existing container associated with a particular muid """
        if muid.timestamp == -1:
            behavior = muid.offset
        elif behavior is None:
            container_builder = container_builder or self._store.get_container(muid)
            behavior = getattr(container_builder, "behavior")
        cls = self._container_types.get(behavior)
        if not cls:
            raise AssertionError(f"behavior not recognized: {behavior}")
        return cls(muid=muid, database=self)

    def dump(self, *,
             include_global_containers=True,
             as_of: GenericTimestamp = None,
             file=stdout,
             ):
        """ writes the contents of the database to file """
        from .container import Container
        for muid, container_builder in self._store.list_containers():
            container = self.get_container(muid, container_builder=container_builder)
            assert isinstance(container, Container)
            if container.size(as_of=as_of):
                container.dump(as_of=as_of, file=file)
        if include_global_containers:
            for cls in self._container_types.values():
                container = cls.get_global_instance(self)
                assert isinstance(container, Container)
                if container.size(as_of=as_of):
                    container.dump(as_of=as_of, file=file)

    def get_attribution(self, timestamp: MuTimestamp, medallion: Medallion, *_) -> Attribution:
        """ Takes a timestamp and medallion and figures out who/what to blame the changes on.

            After the timestamp and medallion it will ignore other ordered arguments, so
            that it can be used via get_attribution(*muid).
        """
        comment = self._store.get_comment(medallion=medallion, timestamp=timestamp)
        chain = self._store.find_chain(medallion=medallion, timestamp=timestamp)
        identity = self._store.get_identity(chain)
        return Attribution(
            timestamp=timestamp,
            medallion=medallion,
            identity=identity,
            abstract=comment,
        )

    def log(self, limit: Optional[int] = -10, *, include_starts=False) -> Iterable[Attribution]:
        """ Gets a list of attributions representing all bundles stored by the db. """
        for bundle_info in self._store.get_some(BundleInfo, limit):
            assert isinstance(bundle_info, BundleInfo)
            if bundle_info.timestamp == bundle_info.chain_start and not include_starts:
                continue
            yield self.get_attribution(bundle_info.timestamp, bundle_info.medallion)

    def show_log(self, limit: Optional[int] = -10, *, include_starts=False, file=stdout):
        """ Just prints the log to stdout in a human-readable format. """
        for attribution in self.log(limit=limit, include_starts=include_starts):
            print(attribution, file=file)

    def get_by_name(self, name: str, as_of: GenericTimestamp = None) -> List:
        """ Returns all containers of the given type with the given name.
        """
        returning = list()
        as_of_ts = self.resolve_timestamp(as_of)
        for found_container in self._store.get_by_name(name, as_of=as_of_ts):
            returning.append(self.get_container(found_container.address))
        return returning
