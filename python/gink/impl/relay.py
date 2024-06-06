""" contains the Relay class """

# standard python modules
from typing import Set, Union, Iterable, List, Callable, Optional
from logging import getLogger
from re import fullmatch, IGNORECASE


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
from .looping import Selectable, Finished
from .bundle_store import BundleStore
from .server import Server

class Relay(Server):

    _store: BundleStore
    _not_acked: Set[BundleInfo]

    def __init__(self, store: Union[BundleStore, str, None] = None):
        super().__init__()
        if isinstance(store, str):
            store = LmdbStore(store)
        if isinstance(store, type(None)):
            store = MemoryStore()
        assert isinstance(store, AbstractStore)
        self._store = store
        self._logger = getLogger(self.__class__.__name__)
        self._callbacks: List[Callable[[BundleWrapper], None]] = list()
        self._connections: Set[Connection] = set()
        self._not_acked = set()
        if self._store.is_selectable():
            self._store.on_ready = self._on_store_ready
            self._add_selectable(self._store)

    def add_callback(self, callback: Callable[[BundleWrapper], None]):
        self._callbacks.append(callback)

    def get_store(self) -> BundleStore:
        """ returns the store managed by this database """
        return self._store

    def get_connections(self) -> Iterable[Connection]:
        for connection in self._connections:
            yield connection

    def connect_to(self, target: str, auth_data: Optional[str] = None, name: Optional[str] = None):
        """ initiate a connection to another gink instance """
        self._logger.info("initating connection to %s", target)
        match = fullmatch(r"(ws+://)?([a-z0-9.-]+)(?::(\d+))?(?:/+(.*))?$", target, IGNORECASE)
        assert match, f"can't connect to: {target}"
        prefix, host, port, path = match.groups()
        if prefix and prefix != "ws://":
            raise NotImplementedError("only vanilla websockets currently supported")
        port = port or "8080"
        path = path or "/"
        sync_func = lambda **_: self._store.get_chain_tracker().to_greeting_message()
        connection = WebsocketConnection(
            host=host,
            port=int(port),
            path=path,
            name=name,
            sync_func=sync_func,
            auth_data=auth_data,
            )
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._logger.debug("connection added")
        self._add_selectable(connection)

    def _on_store_ready(self):
        self._store.refresh(self._on_bundle)

    def close(self):
        self._store.close()
        super().close()

    def _on_bundle(self, bundle_wrapper: BundleWrapper) -> None:
        """ Sends a bundle either created locally or received from a peer to other peers.

            Should only be called when a bundle has been successfully added to the local store.
        """
        self._logger.debug("_on_bundle for %s", bundle_wrapper.get_info())
        for peer in self._connections:
            peer.send_bundle(bundle_wrapper)
        for callback in self._callbacks:
            callback(bundle_wrapper)

    def receive(self, bundle_wrapper: BundleWrapper) -> bool:
        """ Receive a bundle, either created locally or from a peer.

            Returns true if the bundle is novel.
        """
        return self._store.apply_bundle(bundle_wrapper, self._on_bundle)

    def _on_connection_ready(self, connection: Connection) -> None:
        if connection in self._connections:
            try:
                for thing in connection.receive_objects():
                    if isinstance(thing, BundleWrapper):  # some data
                        self.receive(thing)
                        connection.send(thing.get_info().as_acknowledgement())
                    elif isinstance(thing, ChainTracker):  # greeting message
                        self._store.get_bundles(connection.send_bundle, peer_has=thing)
                    elif isinstance(thing, BundleInfo):  # an ack:
                        self._not_acked.discard(thing)
                    else:
                        raise AssertionError(f"unexpected object {thing}")
            except Finished:
                self._connections.remove(connection)
                self._remove_selectable(connection)
                raise

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        (socket, addr) = listener.accept()
        connection: Connection = WebsocketConnection(
            socket=socket,
            host=addr[0],
            port=addr[1],
            sync_func=lambda **_: self._store.get_chain_tracker().to_greeting_message(),
            auth_func=listener.get_auth(),
        )
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr)
        return [connection]
