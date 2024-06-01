""" contains the Relay class """

# standard python modules
from typing import Set, Union, Iterable, List, Callable, Optional
from threading import Lock
from logging import getLogger
from re import fullmatch, IGNORECASE
from socket import socketpair

# gink modules
from .abstract_store import AbstractStore
from .bundle_info import BundleInfo
from .connection import Connection
from .websocket_connection import WebsocketConnection
from .listener import Listener
from .chain_tracker import ChainTracker
from .lmdb_store import LmdbStore
from .memory_store import MemoryStore
from .bundle_wrapper import BundleWrapper
from .utilities import (
    experimental,
)
from .looping import Selectable, Finished
from .bundle_store import BundleStore
from .typedefs import AuthFunc

class Relay:

    _store: BundleStore
    _connections: Set[Connection]
    _listeners: Set[Listener]
    _lock: Lock
    _not_acked: Set[BundleInfo]

    def __init__(self, store: Union[BundleStore, str, None] = None):
        if isinstance(store, str):
            store = LmdbStore(store)
        if isinstance(store, type(None)):
            store = MemoryStore()
        assert isinstance(store, AbstractStore)
        self._store = store
        self._connections = set()
        self._listeners = set()
        self._logger = getLogger(self.__class__.__name__)
        self._callbacks: List[Callable[[BundleWrapper], None]] = list()
        (self._socket_left, self._socket_rite) = socketpair()
        self._indication_sent = False
        self._lock = Lock()
        self._not_acked = set()
        if self._store.is_selectable():
            self._indicate_selectables_changed()

    def fileno(self) -> int:
        return self._socket_rite.fileno()

    @experimental
    def add_callback(self, callback: Callable[[BundleWrapper], None]):
        self._callbacks.append(callback)

    def start_listening(self, ip_addr="", port: Union[str, int] = "8080", auth_func: Optional[AuthFunc]=None):
        """ Listen for incoming connections on the given port.

            Note that you'll still need to call "run" to actually accept those connections.
        """
        port = int(port)
        self._logger.info("starting to listen on %r:%r", ip_addr, port)
        listener = Listener(WebsocketConnection, ip_addr=ip_addr, port=port, auth_func=auth_func)
        listener.on_ready = lambda: self._on_listener_ready(listener)
        self._listeners.add(listener)
        self._indicate_selectables_changed()

    def connect_to(self, target: str, auth_data: Optional[str] = None):
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
        connection = WebsocketConnection(
            host=host,
            port=int(port),
            path=path,
            greeting=greeting,
            auth_data=auth_data,
            )
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._logger.debug("connection added")
        self._indicate_selectables_changed()

    def _on_store_ready(self):
        self._store.refresh(self._on_bundle)

    def _indicate_selectables_changed(self):
        if not self._indication_sent:
            self._socket_left.send(b'0x01')
            self._indication_sent = True

    def close(self):
        for connection in self._connections:
            connection.close()
        for listener in self._listeners:
            listener.close()
        self._store.close()
        self._socket_left.close()
        self._socket_rite.close()

    def _on_bundle(self, bundle_wrapper: BundleWrapper) -> None:
        """ Sends a bundle either created locally or received from a peer to other peers.
        """
        for peer in self._connections:
            peer.send_bundle(bundle_wrapper)
        for callback in self._callbacks:
            callback(bundle_wrapper)

    def _on_connection_ready(self, connection: Connection) -> None:
        with self._lock:
            try:
                for thing in connection.receive_objects():
                    if isinstance(thing, BundleWrapper):  # some data
                        self._store.apply_bundle(thing, self._on_bundle)
                    elif isinstance(thing, ChainTracker):  # greeting message
                        self._store.get_bundles(connection.send_bundle, peer_has=thing)
                    elif isinstance(thing, BundleInfo):  # an ack:
                        self._not_acked.discard(thing)
                    else:
                        raise AssertionError("unexpected object")
            except Finished:
                self._connections.remove(connection)
                raise

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        sync_message = self._store.get_chain_tracker().to_greeting_message()
        connection: Connection = listener.accept(sync_message)
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._logger.info("accepted incoming connection from %s", connection)
        return [connection]

    def on_ready(self) -> Iterable[Selectable]:
        if self._indication_sent:
            self._socket_rite.recv(1)
            self._indication_sent = False
        if self._store.is_selectable():
            self._store.on_ready = self._on_store_ready
            yield self._store
        for listener in self._listeners:
            yield listener
        for connection in self._connections:
            yield connection
